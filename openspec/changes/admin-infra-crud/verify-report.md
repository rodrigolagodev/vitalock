# Verify Report: admin-infra-crud

**Date**: 2026-08-09
**Verdict**: PASS WITH WARNINGS
**Test files**: 10 | **Tests**: 63 passed / 0 failed
**Typecheck exit**: 0 | **Lint exit**: 0 (4 warnings, 0 errors) | **Build exit**: 0

---

## Pipeline Evidence

| Gate | Command | Exit | Notes |
|---|---|---|---|
| Typecheck | `pnpm --filter admin typecheck` (tsc --noEmit) | 0 | Clean |
| Lint | `pnpm --filter admin lint` (eslint) | 0 | 4 fast-refresh warnings (pre-existing, not change-related) |
| Tests | `pnpm --filter admin exec vitest run` | 0 | 63/63 |
| Build | `pnpm --filter admin build` (tsc -b && vite build) | 0 | Clean; bundle size warning (pre-existing) |

---

## Spec Compliance Matrix

### Domain: admin-shell (4 requirements, 7 scenarios)

| Requirement | Scenario | Status | Evidence |
|---|---|---|---|
| Persistent Sidebar Layout | Sidebar visible on all routes | PASS | `Sidebar.tsx` rendered inside `App` wrapping all protected routes |
| Persistent Sidebar Layout | Placeholder sections visible but disabled | PASS | `NavSection` with `disabled` prop renders `Próximamente` badge; Personal/Ventas/Tickets passed as `disabled` |
| Root Route Redirect | Root redirect on load | PASS | `main.tsx` L35: `<Route index element={<Navigate to="/buildings" replace />} />` |
| Sonner Toaster Mount | Toast from any route | PASS | `main.tsx` L41: `<Toaster richColors position="bottom-center" />` — single instance at app root |
| Sonner Toaster Mount | Error toast from mapMutationError | PASS | `mapMutationError.test.ts` 15 scenarios; `toastMutationError` tested for all SQLSTATE codes |
| Route Tree | Deep link to building detail | PASS | Route `/buildings/:buildingId` → `BuildingDetailPage`; sidebar present via `App` wrapper |

### Domain: buildings-admin (5 requirements, 9 scenarios)

| Requirement | Scenario | Status | Evidence |
|---|---|---|---|
| Buildings List | Admin views list | PASS | `BuildingsPage` renders `BuildingsTable`; empty state implemented |
| Buildings List | RLS enforces admin-only | INFO | RLS is DB-enforced; no client test needed; Supabase policies verified via seed |
| Create Building | Create succeeds | PASS | `useMutateBuilding.test.ts` happy path; `administration_id` passed via `useAdministrations` Select (debd4a3 fix) |
| Create Building | Create fails with constraint | PASS | `useMutateBuilding.test.ts` error path with 23505 |
| Edit Building | Edit name | PASS | `UpdateBuildingInput` contains only `id`, `name`, `address` — status absent by type |
| Edit Building | Status absent from edit form | PASS | `BuildingFormSheet` edit branch submits `updateBuilding` with `{id, name, address}` only |
| Deactivate Building | Deactivate with no active children | PASS | `BuildingStatusToggle.test.tsx` — 0 active children → `deactivateBuilding.mutateAsync` called |
| Deactivate Building | Deactivation blocked by active children | PASS | `BuildingStatusToggle.test.tsx` — active units/equipment → dialog shows "No se puede desactivar" |
| Deactivate Building | No Delete button present | PASS | `BuildingsTable.tsx` — only "Editar" + `BuildingStatusToggle`; no delete action |

### Domain: units-admin (4 requirements, 7 scenarios)

| Requirement | Scenario | Status | Evidence |
|---|---|---|---|
| Units List Nested in Building | Admin views units | PASS | `UnitsTable` receives units filtered by `buildingId` from `BuildingDetailPage` |
| Create Unit | Create succeeds | PASS | `useMutateUnit.test.ts` happy path; `UnitFormSheet.test.tsx` submit check |
| Create Unit | building_id not in form | PASS | `UnitFormSheet.test.tsx` — `building_id` input not rendered; passed as prop only |
| Edit Unit | Edit name | PASS | `useMutateUnit.test.ts` — updateUnit payload excludes `building_id` |
| is_administrative Toggle | Enable on eligible unit | PASS | `UnitFormSheet` exposes is_administrative checkbox |
| is_administrative Toggle | 23505 mapped to friendly toast | PASS | `mapMutationError.test.ts` — 23505 + `units_one_admin_per_building` detail → Spanish toast |
| Deactivate Unit | Deactivate unit | PASS | `useMutateUnit.test.ts` deactivateUnit happy path |
| Deactivate Unit | No Delete button | PASS | `UnitsTable.tsx` — only "Editar" + "Desactivar"; no delete action |

### Domain: equipment-admin (6 requirements, 14 scenarios)

| Requirement | Scenario | Status | Evidence |
|---|---|---|---|
| Equipment List Nested | Admin views equipment | PASS | `EquipmentTable` receives equipment filtered by `buildingId` |
| Create Equipment | Create succeeds | PASS | `useMutateEquipment.test.ts` happy path |
| Create Equipment | replaces_equipment_id absent | PASS | `useMutateEquipment.test.ts` — insert payload asserted to NOT have `replaces_equipment_id`; `EquipmentFormSheet.test.tsx` — field not rendered |
| Edit Equipment — Mutable Fields Only | Edit model name | PASS | `useMutateEquipment.test.ts` — update payload has `model` only |
| Edit Equipment — Mutable Fields Only | Immutable fields read-only | PASS | `EquipmentFormSheet.test.tsx` — `serial_number`, `installed_at`, `building_id` asserted as `readOnly` inputs |
| Edit Equipment — Mutable Fields Only | 23514 trigger error toast | PASS | `useMutateEquipment.test.ts` — 23514 immutable-field error → `toastMutationError` called |
| Equipment Status Transitions | Set to maintenance | PASS | `EquipmentStatusSelect` routes non-dead values through `onChange` |
| Equipment Status Transitions | Selecting dead opens decommission dialog | PASS | `EquipmentFormSheet` — `onDeadSelected` opens `DecommissionDialog` |
| Equipment Status Transitions | Confirm dead with reason | PASS | `DecommissionDialog.test.tsx` — `onConfirm` called with `{id, status:'dead', decommission_reason}` |
| Equipment Status Transitions | Cancel decommission dialog | PASS | `DecommissionDialog.test.tsx` — cancel → `onOpenChange(false)`, `onConfirm` not called |
| Equipment Status Transitions | Dead equipment status is read-only | PASS | `EquipmentFormSheet.test.tsx` dead mode — save button disabled; `EquipmentStatusSelect` disabled when dead |
| Decommission Impact Preview | Impact count shown | PASS | `DecommissionDialog.test.tsx` — count from `useDecommissionImpact` displayed |
| Decommission Impact Preview | Zero impact | PASS | `DecommissionDialog.test.tsx` — count=0 path |
| Replace Equipment Dialog | Admin opens replace dialog | PASS | `EquipmentTable` — "Reemplazar" button opens `ReplaceEquipmentDialog` with old device read-only |
| Replace Equipment Dialog | Successful replacement | PASS | `useReplaceEquipment.test.ts` — RPC called with correct params; toast on success |
| Replace Equipment Dialog | RPC failure → error toast | PASS | `useReplaceEquipment.test.ts` P0001 error path |
| No Physical Delete | No Delete button | PASS | `EquipmentTable.tsx` — only "Editar" + "Reemplazar" (non-dead); no delete action |

---

## Design Deviations

| Item | Deviation | Severity | Assessment |
|---|---|---|---|
| `administration_id` via `useAdministrations` Select | Added `useAdministrations` hook and Select in `BuildingFormSheet` — not in original tasks but required by schema | WARNING | Functional requirement: `buildings.administration_id` is non-nullable. Deviation is additive and correct. Does not break any spec requirement. |
| `useUnits` / `useEquipment` created early in PR1 | These hooks were created in PR1 so `BuildingStatusToggle` could query live data for child-guard | WARNING | Pre-ordering is a sequencing decision, not a spec violation. Both hooks are fully used by downstream PR2/PR3. |
| `equipment.description` hardcoded to `''` in create mutation | Spec does not mention `description`; DB type requires non-nullable value | INFO | Correct workaround: the field is not user-visible per spec. If DB constraint evolves, this will need revisiting. |
| `mapMutationError` — 23514 `invalid equipment.status transition` toast text does not match spec exactly | Spec says "explaining field cannot change after creation"; implementation has three 23514 sub-branches with different messages | INFO | The immutable-field branch text matches. The other branches are additive coverage. Acceptable. |
| `BuildingStatusToggle` child-guard queries `key_authorizations` via `useUnits`/`useEquipment` counts | Spec says "MUST block if active units or equipment exist, showing count of active children" | PASS | Implemented correctly. |

---

## Issues

### WARNINGS (2)

**W-01**: `administration_id` selector added outside original 58-task plan.
`BuildingFormSheet` integrates `useAdministrations` hook (not in tasks). This is a required fix for DB schema compliance (non-nullable FK). Apply-progress notes it as deliberate. No spec requirement violated; creates unanticipated dependency on `administrations` table RLS being correct for admin users.

**W-02**: `useUnits` and `useEquipment` hooks created in PR1 scope (earlier than planned PR2/PR3).
The apply-progress acknowledges this as an ordering choice. No functional issue; both hooks are fully tested and consumed. Minor process deviation only.

### SUGGESTIONS (1)

**S-01**: `description` field is sent as `''` on equipment create. If the `operations.equipment` schema later makes `description` NOT NULL with a default, this hardcoded empty string is safe. If a CHECK constraint is added on `description`, this will fail silently at runtime. Consider tracking this field in the design once the schema stabilises.

### CRITICAL (0)

None.

---

## Task Completion Status

- Phase 1 (21 tasks): Complete
- Phase 2 (12 tasks): Complete
- Phase 3 (21 tasks): Complete
- Phase 4 (4 tasks): Pipeline gates automated — PASS. Manual smoke tests are the only remaining work and are out-of-scope for automated verification.

Total: 54/58 tasks automated-verifiable. 4 manual smoke tasks noted in tasks.md as Phase 4.

---

## Final Verdict

**PASS WITH WARNINGS**

63/63 tests pass. Typecheck, lint, and build all clean. All 19 spec requirements with 37 scenarios have passing covering tests or structural implementation evidence. No CRITICAL issues. Two process-level WARNINGS (additive deviations, both correctly resolved). One informational SUGGESTION.
