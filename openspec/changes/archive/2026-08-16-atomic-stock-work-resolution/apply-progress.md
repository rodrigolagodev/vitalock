# Apply Progress: atomic-stock-work-resolution

**Status**: complete (19/19 tasks)
**Mode**: Standard
**Delivery**: single-pr with size:exception (user explicitly approved 390-460 line forecast)
**Date**: 2026-08-16

---

## Task Status

### Phase 1: DB Migration (Group A) — COMPLETE

- [x] T-01: Created migration file with header block and step labels (a)–(d)
- [x] T-02: Step (a) — DROP + ADD `stock_movements_type_check` with 10 types including `egreso_reemplazo`
- [x] T-03: Step (b) — DROP + ADD `stock_movements_sign_matches_type` with `egreso_reemplazo` in negative branch
- [x] T-04: Step (c) — CREATE `public.resolve_equipment_replacement(...)` full body
- [x] T-05: Step (d) — DO block backfill with `[Backfill 000061]` prefix and NOT EXISTS idempotency guard
- [x] T-06: GRANT EXECUTE on `resolve_equipment_replacement` to authenticated

### Phase 2: SQL Smoke Test (Group D) — COMPLETE

- [x] T-14: Created `test_atomic_stock_work_resolution.sql` with 7 scenarios; all PASS

### Phase 3: Admin Client (Group B) — COMPLETE

- [x] T-07: Created `useResolveEquipmentInstallation.ts`
- [x] T-08: Created `useResolveEquipmentReplacement.ts`
- [x] T-09: Refactored `AssignEquipmentDialog.tsx` — routes `equipment_installation` to atomic hook, `equipment_replacement` to atomic hook, `installation` keeps two-step flow with code comment
- [x] T-10: Modified `useMutateTicketEquipment.ts` — retired `replaceEquipmentInTicket` and `ReplaceEquipmentInTicketInput`; DEVIATION: `createAndAssignEquipment` retained for `installation` category (task said remove but T-09 explicitly keeps it; T-09 instruction wins)
- [x] T-11: Grep confirmed — no remaining callers of `replaceEquipmentInTicket`; `TareaDetailPage.tsx` — no changes needed

### Phase 4: Installer Client (Group C) — COMPLETE

- [x] T-12: Modified `useAssignedTickets.ts` — added `category` to `AssignedTicket` interface, `.select(...)`, raw type, and `.map()` return
- [x] T-13: Modified `TicketsSection.tsx` — added `EXCLUDED_FOR_BATCH` constant, derived `selectable` and `pendingAdmin` arrays, rendered pendingAdmin as read-only "Pendiente de admin" cards

### Phase 5: Verification (Group E) — COMPLETE

- [x] T-15: `supabase migration up --local` — clean apply, no errors
- [x] T-16: All 7 smoke test scenarios PASS
- [x] T-17: 4 PASS (test_resolve_ticket), 6 PASS (test_unify_work_tracking) — zero regressions
- [x] T-18: E2E via psql — all 4 assertions PASS (a: movements share ticket_id; b: ticket resolved; c: equipment row exists; d: stock_total=9)

### Phase 6: Docs (Group F) — COMPLETE

- [x] T-19: Updated `supabase/FLOWS.md` — added §11.18 (renamed prior 11.18→11.19) with atomic pattern description

---

## Files Changed

| File | Action | Lines | Notes |
|------|--------|-------|-------|
| `supabase/migrations/20260812000061_atomic_stock_work_resolution.sql` | Created | ~290 | Steps (a)–(e) + backfill + GRANT |
| `supabase/tests-sql/test_atomic_stock_work_resolution.sql` | Created | ~680 | 7 scenarios; all PASS |
| `apps/admin/src/hooks/useResolveEquipmentInstallation.ts` | Created | 52 | |
| `apps/admin/src/hooks/useResolveEquipmentReplacement.ts` | Created | 57 | |
| `apps/admin/src/hooks/useMutateTicketEquipment.ts` | Modified | -35 | Removed replaceEquipmentInTicket; kept createAndAssignEquipment |
| `apps/admin/src/components/tareas/AssignEquipmentDialog.tsx` | Modified | +30/-15 | Atomic routing per category |
| `packages/supabase/src/database.types.ts` | Modified | +12 | Added resolve_equipment_replacement type; fixed p_unit_id nullable |
| `apps/installer/src/hooks/useAssignedTickets.ts` | Modified | +8 | Added category field |
| `apps/installer/src/components/work/TicketsSection.tsx` | Modified | +28/-2 | pendingAdmin filter + read-only cards |
| `supabase/FLOWS.md` | Modified | +40 | §11.18 atomic equipment flows |

---

## Deviations from Design

1. **`createAndAssignEquipment` retained in `useMutateTicketEquipment`**: T-10 said to remove it but T-09 explicitly keeps it for the `installation` category. The design §data-flow also shows `installation → createAndAssignEquipment`. T-09 instruction wins; `replaceEquipmentInTicket` was removed as planned.

2. **`resolve_equipment_installation` RPC patched (step c-fix)**: Migration `20260811000052` added a `BEFORE UPDATE` trigger (`tickets_require_equipment_on_resolve`) that requires `equipment_id IS NOT NULL` when a ticket transitions to `resolved`. The original `resolve_equipment_installation` RPC (migration `20260811000041`) never updated the ticket's `equipment_id`, making it broken after the trigger was introduced. Migration 061 adds `CREATE OR REPLACE FUNCTION` to fix this. This is a pre-existing defect discovered during test authorship.

3. **`stock_movements_maintain_counters` trigger patched (step e)**: The trigger (migration `20260811000030`) enumerated all known movement types with a CASE statement and raised `unknown type` for anything else. Adding `egreso_reemplazo` to the type CHECK without updating the trigger would cause every `egreso_reemplazo` insert to fail. Migration 061 adds `CREATE OR REPLACE FUNCTION` to add the `egreso_reemplazo` WHEN branch.

4. **`packages/supabase/src/database.types.ts` modified**: Not listed in the original design's File Changes table, but required because `tsc --noEmit` fails if the RPC type is missing or has incorrect nullability. Added `resolve_equipment_replacement` type and fixed `p_unit_id: string | null | undefined` in `resolve_equipment_installation`.

---

## Test Evidence

### Focused test — SQL smoke
```
Command: psql -f supabase/tests-sql/test_atomic_stock_work_resolution.sql
Result: 7 PASS notices, 0 errors
```

### Regression — test_resolve_ticket.sql
```
Result: 4 PASS notices, 0 errors
```

### Regression — test_unify_work_tracking.sql
```
Result: 6 PASS notices, 0 errors
```

### TypeScript compilation
```
Command: pnpm --filter admin typecheck && pnpm --filter installer typecheck
Result: exit 0 for both
```

### E2E (T-18)
```
Command: psql inline DO block simulating confirm_order + resolve_equipment_installation
Result:
  (a) PASS: reserva/egreso/liberacion share ticket_id
  (b) PASS: ticket status=resolved
  (c) PASS: operations.equipment row exists (serial=E2E-SERIAL-001)
  (d) PASS: stock_total=9 (net -qty)
```

### Runtime harness
```
Command: supabase db reset --local
Result: All 62 migrations apply cleanly including 20260812000061
```

---

## Rollback Boundary

To revert without affecting prior work:
1. `drop function public.resolve_equipment_replacement(uuid, uuid, text, text, text, text, uuid);`
2. Revert `resolve_equipment_installation` and `stock_movements_maintain_counters` to their pre-061 definitions.
3. Restore original `stock_movements_type_check` and `stock_movements_sign_matches_type` (drop `egreso_reemplazo`).
4. `delete from public.stock_movements where note like '[Backfill 000061]%';`
5. `git revert` the client commits (hooks, dialog, installer, types).
