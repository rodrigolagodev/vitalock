# Tasks: technical-installation-stock-lifecycle

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 480–620 |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR (within 800-line budget) |
| Delivery strategy | single-pr |
| Chain strategy | size-exception |

Decision needed before apply: Yes
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Medium

> The estimate (480–620 lines) fits the 800-line session budget but exceeds the
> 400-line review default. Delivery strategy is `single-pr`, which requires a
> `size:exception` acknowledgement before `sdd-apply` starts.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | DB migration (3 functions) | PR 1 | `supabase db reset && supabase migration up` | `psql` manual-verification checklist step 3–6 | Re-run prior `CREATE OR REPLACE FUNCTION` blocks from `20260831000000_baseline.sql` |
| 2 | Admin form + tarea detail + installer | PR 1 (same) | `pnpm --filter admin test --run` + `pnpm --filter installer test --run` | Admin UI create order → confirm → configure → resolve | Revert 5 TypeScript files; DB migration stays compatible either way |

---

## Phase 1: Database Migration

- [x] 1.1 Create `supabase/migrations/20260901120000_extend_installation_category_lifecycle.sql` with the mandatory comment header documenting the `app.allow_resolve_equipment_id_write` GUC contract and `single-caller` rule.
- [x] 1.2 In the migration: `CREATE OR REPLACE FUNCTION public.technical_order_items_intent_immutable()` — add `v_allow_resolve_equipment` local variable using `coalesce(current_setting('app.allow_resolve_equipment_id_write', true), 'false') = 'true'`; add narrow-bypass branch (admits only `intended_equipment_id` change, rejects if any other intent column also moves).
- [x] 1.3 In the migration: `CREATE OR REPLACE FUNCTION public.configure_technical_ticket_equipment()` — extend the category guard from `IN ('equipment_installation', 'equipment_replacement')` to `IN ('equipment_installation', 'equipment_replacement', 'installation')`.
- [x] 1.4 In the migration: `CREATE OR REPLACE FUNCTION public.resolve_ticket()` — extend the outer side-effect guard to `IN ('equipment_installation', 'equipment_replacement', 'installation')`; extend the inner freestanding-install branch condition to `IN ('equipment_installation', 'installation')`; insert the intent-bypass window (set GUC → UPDATE `technical_order_items.intended_equipment_id` → clear GUC) immediately after the ticket `equipment_id` UPDATE, guarded by `v_toi.id IS NOT NULL`.

---

## Phase 2: Admin Form

- [x] 2.1 In `apps/admin/src/components/servicio-tecnico/TechnicalOrderForm.tsx` — extend `TechnicalItemEquipmentField`: remove the early-return `null` for `itemType === 'installation'`; render the same product selector (filtered to `category='equipment'`) with an installation-appropriate label (e.g. "SKU del equipo a instalar").
- [x] 2.2 In the same file — extend the Zod schema's `superRefine` (or the equivalent conditional block) to require `product_id` non-null when `item_type === 'installation'`, mirroring the existing `equipment` branch. Leave `maintenance` and `equipment_replacement` unchanged.

---

## Phase 3: Admin Tarea Detail UI

- [x] 3.1 In `apps/admin/src/routes/tareas/TareaDetailPage.tsx` — add `'installation'` to `CATEGORIES_TWO_STEP_CONFIGURE` (line 25).
- [x] 3.2 In `apps/admin/src/components/tareas/ConfigureEquipmentPanel.tsx` — extend the `category` prop TypeScript union from `'equipment_installation' | 'equipment_replacement'` to include `'installation'`; add `'installation'` key to `CATEGORY_HEADINGS` (and any help-copy map) with label e.g. `'Configurar equipo a instalar'`.

---

## Phase 4: Installer UI

- [x] 4.1 In `apps/installer/src/components/work/TicketCard.tsx` — add `'installation'` to `TWO_STEP_CATEGORIES` array (line 28–31).
- [x] 4.2 In `apps/installer/src/components/work/ConfigureEquipmentInline.tsx` — extend `HEADINGS` record type union from `'equipment_installation' | 'equipment_replacement'` to include `'installation'`; add `'installation'` key with label e.g. `'Equipo a instalar'`; remove the explicit cast on line 23 (`ticket.category as ...`) or widen it to include `'installation'`.
- [x] 4.3 In `apps/installer/src/routes/TaskDetailPage.tsx` — extend the `ConfigureEquipmentInline` render gate (line 308: `category === EQUIPMENT_INSTALLATION || category === EQUIPMENT_REPLACEMENT`) to also match `category === 'installation'` (or add an `INSTALLATION` constant matching the existing pattern).

---

## Phase 5: Tests (Vitest)

- [x] 5.1 **RED** `apps/admin/src/components/tareas/__tests__/ConfigureEquipmentPanel.test.tsx` — add failing test: `category='installation'` renders panel heading without TypeScript error.
- [x] 5.2 **GREEN** make 5.1 pass via task 3.2 changes.
- [x] 5.3 **RED** `apps/installer/src/components/work/__tests__/ConfigureEquipmentInline.test.tsx` — add failing test: renders correct heading for `category='installation'`; submits configure payload; no checkbox affordance shows.
- [x] 5.4 **GREEN** make 5.3 pass via task 4.2 changes.
- [x] 5.5 **RED** `apps/admin/src/hooks/__tests__/useConfigureTechnicalTicketEquipment.test.ts` — add case: hook called with a ticket stub where `category='installation'` passes correct `ticketId` + payload to mocked RPC without raising.
- [x] 5.6 **GREEN** make 5.5 pass (no hook code change expected; test confirms existing hook is category-agnostic).
- [x] 5.7 **RED** `apps/installer/src/hooks/__tests__/useConfigureTechnicalTicketEquipment.test.ts` — add symmetric case for `category='installation'` through mocked RPC.
- [x] 5.8 **GREEN** make 5.7 pass.
- [x] 5.9 **RED** `apps/admin/src/components/servicio-tecnico/__tests__/TechnicalOrderForm.test.tsx` — add two Zod schema unit tests: (a) `item_type='installation'` + `product_id=null` fails with `product_id`-scoped error; (b) same with `product_id=<uuid>` passes.
- [x] 5.10 **GREEN** make 5.9 pass via task 2.2 changes.
- [x] 5.11 Assert existing test suites remain green: `pnpm --filter admin test --run` + `pnpm --filter installer test --run`.

---

## Phase 6: Manual Verification Checklist

- [x] 6.1 Create `openspec/changes/technical-installation-stock-lifecycle/manual-verification.md` with the six-step E2E checklist from design section 9: seed → create order → confirm (assert `reserva`) → configure equipment (assert `pending_new_serial`) → resolve (assert `operations.equipment`, `egreso_instalacion`, `liberacion_reserva`, `intended_equipment_id`) → intent-immutability negative test.

---

## Key Learnings

1. All four production bugs share one root cause: the `installation` → `category='installation'` mapping places items outside every downstream category guard, so extending guards is the correct minimum-delta fix rather than adding new logic.
2. `confirm_technical_order` already gates reservation on `product_id IS NOT NULL` with no category filter; the admin form withholding `product_id` for `installation` was the entire gap, so no RPC change is needed for stock reservation.
3. The `technical_order_items_intent_immutable` trigger requires a two-gate bypass: a transaction-local GUC (`set_config(..., true)`) contains cross-transaction leakage, and a narrow-column admission check inside the trigger (only `intended_equipment_id` may change) contains intra-transaction misuse.
4. Phase ordering is strict: migration first (DB guards), then admin form (enables `reserva` at confirm), then UI category gates (enables configure/resolve UX), then tests asserting each behavior — each phase is unblocked only after its predecessor.
5. `ConfigureEquipmentInline` and `useConfigureTechnicalTicketEquipment` are already category-agnostic at the logic level; only their TypeScript type unions and `HEADINGS`/`TWO_STEP_CATEGORIES` records needed extending, confirming the prior cross-app symmetry investment.
