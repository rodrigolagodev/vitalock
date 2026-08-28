---
name: rls-boundaries
title: RLS — Row-Level Security Boundaries
kind: cross-cutting
actors: [admin, installer]
covers_requirements:
  - auth#role-domain
  - auth#admin-full-access
  - auth#installer-scoped-worklist
related_rpcs:
  - identity.current_staff_id
  - identity.current_staff_role
  - identity.is_admin
  - identity.is_installer
related_tables:
  - public.administrations
  - public.buildings
  - public.units
  - public.rfid_keys
  - public.stock_movements
  - identity.staff
  - operations.equipment
  - operations.key_authorizations
  - support.tickets
  - support.ticket_comments
  - support.equipment_updates
  - sales.*
covering_tests:
  pgtap:
    - supabase/tests-sql/test_112_rls_admin_only.sql
  vitest: []
last_verified: 2026-08-27
---

# RLS — Row-Level Security Boundaries

## Purpose

Vitalock has a **single tenant** (the Vitalock company itself). The
staff table has **two active roles**:

- **admin** — full CRUD on everything.
- **installer** — SELECT on operational world + scoped UPDATE on
  their own worklist.

There is no `viewer` role — it was removed in
`supabase/migrations/20260808000018_remove_viewer_role.sql`. There is
no per-administration tenancy — an admin sees ALL administrations,
not just "theirs". A future roadmap opens this up for administration
end users; today the policies are written to make that extension easy
without redoing the whole RLS layer.

## The identity helpers

Defined in
`supabase/migrations/20260808000013_auth_helpers.sql`:

| Function | Returns | Used by |
|---|---|---|
| `identity.current_staff_id()` | `uuid` — the staff id of the logged-in user, or NULL | Ticket ownership scoping |
| `identity.current_staff_role()` | `'admin' \| 'installer' \| NULL` | Column-level guards |
| `identity.is_admin()` | boolean | Every `admin_*` policy |
| `identity.is_installer()` | boolean | Every `installer_*` policy |

Granted `execute` to `authenticated` (line 78). Policies use them
directly.

## Policy families

### Admin — full CRUD (single repeated pattern)

`supabase/migrations/20260808000015_rls_real_policies.sql:36-53`
attaches one policy per table:

```sql
create policy admin_all_<table> on <schema>.<table>
  for all to authenticated
  using (identity.is_admin())
  with check (identity.is_admin());
```

Tables covered: administrations, buildings, units, rfid_keys, staff,
equipment, key_authorizations, all of `sales.*`, all of
`support.tickets`, `support.ticket_comments`.

New tables added since (key_orders, technical_orders,
technical_order_items, stock_movements, products) have their own
follow-on policies; verify they exist and match the same pattern.

### Installer — read the operational world

`installer_read_*` policies at lines 60-65 grant SELECT on:
administrations, buildings, units, rfid_keys, staff, equipment. The
installer sees everything read-only so they have full context when
looking at a ticket.

### Installer — scoped worklist writes

The scoped-write layer is where things get precise:

- **`key_authorizations`** (lines 71-72): SELECT all, UPDATE all. The
  `sync_state` transitions are guarded by the `key_authorizations_validate`
  trigger which restricts what an installer can flip. Direct column
  changes (`rfid_key_id`, `equipment_id`) are immutable by trigger,
  not RLS.

- **`support.tickets`** (lines 75-84): SELECT and UPDATE
  **only where `assigned_to_staff_id = identity.current_staff_id()`**.
  This is the primary "my worklist" filter. Combined with
  `support.enforce_installer_ticket_column_restrictions` (line 248 of
  the two-step migration), the installer cannot mutate
  `assigned_to_staff_id`, `unit_id`, `description`,
  `related_bill_id`, `related_key_request_id`,
  `cancellation_reason`. `equipment_id` is normally denied but a
  transaction-scoped flag (`app.allow_installer_equipment_swap`)
  can bypass it — set only inside `resolve_ticket` for the equipment
  replacement two-step flow.

- **`support.ticket_comments`** (lines 87-100): SELECT and INSERT
  scoped to tickets the installer owns.

### Sales schema — admin-only

Everything in `sales.*` (key_requests, key_request_items, products,
quotes, quote_items, bills, bill_items, payments, recurring_charges)
is admin-only. Installers cannot see billing.

### Storage bucket — `equipment_updates`

`supabase/migrations/20260818000071_storage_bucket_equipment_updates.sql`
defines two policies:

- `admin_all_equipment_updates_mdb` — admin full access.
- `installer_read_assigned_equipment_updates_mdb` — installer can
  read only when the file belongs to an equipment_update tied to a
  ticket assigned to them.

## SECURITY DEFINER RPCs bypass RLS

Every RPC declared `security definer` runs with the function
owner's permissions, NOT the caller's. This is why:

- `configure_key_order_item` can INSERT into `rfid_keys` even though
  an installer normally cannot.
- `resolve_ticket` can flip `equipment_id` even though
  installers normally cannot.
- `create_stock_movement` still checks `identity.is_admin()`
  INSIDE the RPC body — the SECURITY DEFINER bypass would otherwise
  let anyone with execute-grant call it.

Rule of thumb: **any `security definer` RPC MUST perform its own
authorization check** inside the body. See
`supabase/migrations/20260811000042_stock_admin_rpcs.sql:24` for the
canonical example.

## The `installer_key_auth_trigger_null_safe_guard`

`supabase/migrations/20260818000074_installer_key_auth_trigger_null_safe_guard.sql`
adds column-level restrictions on installer UPDATEs to
`key_authorizations`. This complements RLS — RLS allows the row-level
access, this trigger blocks specific columns.

Any change to the `key_authorizations` schema should re-check this
trigger's whitelist.

## Cross-schema RLS quirks

- **`support.tickets` cross-schema FK to `public.buildings`** — RLS
  on tickets does not automatically apply to the joined building.
  PostgREST cannot embed cross-schema FKs (documented in
  `useAssignedTickets.ts:52`), so the app fetches flat rows and
  resolves related entities client-side.
- **Realtime channel filters** — realtime uses the `filter=` clause,
  which is applied as an ADDITIONAL predicate on top of RLS. If RLS
  already scopes the rows, the filter is a defense-in-depth.

## Error paths & guards

| Trigger | Guard | Effect |
|---|---|---|
| Installer INSERTs a ticket | `installer_update_own_tickets` policy (no INSERT policy for installer) | Rejected |
| Installer reassigns a ticket | `enforce_installer_ticket_column_restrictions` | Raises `insufficient_privilege` |
| Installer SELECTs from `sales.*` | No installer policy on sales | Empty result |
| Anonymous user hits any endpoint | Anon key is scoped to auth-only helpers | Rejected |
| SECURITY DEFINER RPC called without body-level auth | If the RPC forgets to check | Silent privilege escalation |

## Known gaps

1. **Some newer tables may lack RLS policies**. Verify by running
   `SELECT * FROM pg_policies WHERE schemaname IN ('public',
   'operations', 'support', 'identity', 'sales')` and cross-check
   against `pg_tables`. Any table without a policy defaults to
   deny-all under `authenticated` — worse: without RLS enabled at
   the table level, it defaults to allow-all, which is a real
   security bug.
2. **`enforce_installer_ticket_column_restrictions` uses
   `current_setting('app.allow_installer_equipment_swap', true)`** —
   a session GUC set inside `resolve_ticket`. Any leak of this GUC
   from another code path would let installers freely edit
   `equipment_id`. Audit before deployment.
3. **No per-administration tenancy today**. Every admin sees every
   administration. If the roadmap ever needs per-admin scoping
   (option B/C in the file's comment), the policies will need a
   `WHERE administration_id = <caller's tenant>` layer.

## QA checklist

- [ ] Login as installer → try to visit `/administraciones` in the
      admin app → confirm the app redirects or shows empty (verify
      the auth wrapper).
- [ ] Login as installer → hit `key_orders` REST endpoint
      directly → confirm empty result (no `installer_*` policy on
      that table).
- [ ] Login as installer → open a ticket assigned to a DIFFERENT
      staff → confirm cannot see it (RLS).
- [ ] Login as installer → try to change `assigned_to_staff_id`
      on a ticket via a direct UPDATE → rejected by trigger.
- [ ] Login as installer → try to write a comment to a ticket not
      assigned to you → rejected.
- [ ] Login as admin → run
      `SELECT COUNT(*) FROM sales.bills` → returns count.

## Related flows

- [[realtime-channels]] — RLS+filter layering.
- All journey docs — every RPC and mutation is subject to these
  boundaries.
