---
name: administration-creation
title: Administration — Create / Edit / Deactivate
kind: journey
actors: [admin]
covers_requirements:
  - administrations-admin#administration-crud
  - administrations-admin#soft-delete-guard
related_rpcs: []
related_tables:
  - public.administrations
  - public.buildings
covering_tests:
  pgtap: []
  vitest:
    - apps/admin/src/hooks/__tests__/useAdministrations.test.ts
    - apps/admin/src/hooks/__tests__/useAdministration.test.ts
last_verified: 2026-08-27
---

# Administration — Create / Edit / Deactivate

## Purpose

Administrations are the **only billable customer entity** in Vitalock. Every
`buildings`, `key_orders(client_type='administration')`, and
`technical_orders(client_type='administration')` traces back to an
`administrations` row. Owners/tenants are **not** first-class entities —
they exist as free text in `rfid_keys` or as `particulares` rows referenced
for pickup authorization only.

This flow is a straight-line CRUD: create a new administration, edit its
data, or deactivate it (soft-only). There is no state machine — status is
binary `active`/`inactive` with a single guard.

## Actors & preconditions

- **admin** — full CRUD via `AdministrationFormSheet` and
  `AdministrationStatusToggle`.
- **preconditions**: none (top of the hierarchy).

## Happy path

### Create

1. Admin lands on `/administraciones` →
   `apps/admin/src/routes/administraciones/AdministrationsPage.tsx:13`.
2. Admin clicks **Nueva administración** → opens
   `AdministrationFormSheet.tsx:36` in create mode.
3. Admin fills `company_name` (required), optional `tax_id`, `email`,
   `phone`, `address`, `notes`. Client-side validation via zod schema
   (`AdministrationFormSheet.tsx:25`).
4. Submits → `useMutateAdministration.createAdministration` mutation
   (`apps/admin/src/hooks/useMutateAdministration.ts:32`) → direct
   `supabase.from('administrations').insert(...)` — **no RPC**.
5. DB validates: `company_name NOT NULL`, `tax_id UNIQUE`, status defaults
   to `'active'` (`supabase/migrations/20260806000002_core_tables.sql:9`).
6. TanStack Query invalidates `['admin', 'administrations']` → list
   refreshes → toast "Administración creada correctamente."

### Edit

7. Admin clicks the pencil icon on a row in `AdministrationsTable.tsx:52`
   → opens `AdministrationFormSheet` with `administration` prop set.
8. Form pre-fills via `reset()` in
   `AdministrationFormSheet.tsx:63`. Submits →
   `useMutateAdministration.updateAdministration` → direct table UPDATE.

### Deactivate

9. Admin clicks the power icon (`AdministrationStatusToggle.tsx:20`) →
   opens confirmation dialog.
10. The dialog reads `useBuildings({ administrationId })` and counts
    `status='active'` (`AdministrationStatusToggle.tsx:32`).
11. **Guard**: if `activeBuildings > 0`, the dialog changes to a hard "No
    se puede desactivar" message with a single "Entendido" button — the
    UPDATE is never sent.
12. Otherwise the confirm button dispatches
    `useMutateAdministration.deactivateAdministration` → direct table
    UPDATE setting `status='inactive'`.

## Cross-cutting effects

- **Cascade to buildings**: DB enforces `ON DELETE RESTRICT` from
  `buildings.administration_id`
  (`supabase/migrations/20260806000002_core_tables.sql:37`). Deletion is
  never possible — the only lifecycle exit is `status='inactive'`.
- **Downstream visibility**: an inactive administration still appears in
  detail pages (its buildings and orders remain queryable) but is filtered
  out of `useAdministrations({ status: 'active' })` — the same filter used
  by `KeyOrderForm` and `TechnicalOrderForm` for the client selector.

## Error paths & guards

| Trigger | Guard | Effect |
|---|---|---|
| Empty `company_name` | zod schema | Field-level error, submit blocked |
| Duplicate `tax_id` | DB UNIQUE constraint | Toast via `toastMutationError` |
| Deactivate with active buildings | Client-side count in `AdministrationStatusToggle:32` | Dialog blocks the action |
| Non-admin caller | RLS `admin_all_administrations` (`supabase/migrations/20260808000015_rls_real_policies.sql:36`) | Empty result on SELECT; INSERT/UPDATE rejected |

## Known gaps

1. **`tax_id` format is not validated** — the schema comment (line 12 of
   `core_tables.sql`) explicitly says CUIT format is not enforced
   "so onboarding can be flexible." An admin can save an invalid CUIT and
   downstream billing exports may fail. Consider adding a CHECK later
   (documented as a future todo in the schema).

## QA checklist

- [ ] Login as admin → `/administraciones` → click **Nueva
      administración** → save with only `company_name` → row appears in
      table with badge "Activa".
- [ ] Try to save a second administration with the same `tax_id` → toast
      shows the unique-violation error.
- [ ] Edit an administration → change `email` → row reflects the new
      value.
- [ ] Deactivate an administration with 0 active buildings → status
      changes to "Inactiva".
- [ ] Try to deactivate an administration with >= 1 active building →
      dialog shows "No se puede desactivar", UPDATE not sent.
- [ ] Login as installer → RLS: `SELECT` returns rows (read policy
      `installer_read_administrations` allows it), UPDATE/INSERT rejected.

## Related flows

- [[building-creation]] — buildings are the direct children.
- [[rls-boundaries]] — admin CRUD vs installer read-only.
- [[key-order-lifecycle]] — how administrations drive key orders.
