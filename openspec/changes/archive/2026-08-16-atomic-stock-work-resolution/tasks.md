# Tasks: Atomic Stock Work Resolution

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 390–460 (additions + deletions) |
| 400-line budget risk | Medium |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (DB migration + SQL test) → PR 2 (admin client) → PR 3 (installer client + docs) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | DB migration + SQL smoke test | PR 1 | `psql -f supabase/tests-sql/test_atomic_stock_work_resolution.sql` | `supabase migration up --local` then run test file | Drop `resolve_equipment_replacement`, restore prior CHECK constraints, delete `[Backfill 000061]` rows |
| 2 | Admin client atomic hooks + dialog refactor | PR 2 | `pnpm --filter admin typecheck` | Open `AssignEquipmentDialog` for an `equipment_installation` ticket in local dev | Revert hook files + dialog changes; `useMutateTicketEquipment` exports restored |
| 3 | Installer category filter + docs | PR 3 | `pnpm --filter installer typecheck` | Open `TicketsSection` with a mixed-category building in local dev | Revert `useAssignedTickets.ts`, `TicketsSection.tsx`, and `FLOWS.md` |

---

## Phase 1: DB Migration (Group A)

- [x] 1.1 **T-01** — Create `supabase/migrations/20260812000061_atomic_stock_work_resolution.sql` with a header block comment: change name, rationale, rollback pointer, and internal step labels (a) through (d). File created; empty body. (~10 lines)
  - _Files_: `supabase/migrations/20260812000061_atomic_stock_work_resolution.sql`
  - _Depends on_: none
  - _Req_: stock-inventory §Egreso Reemplazo Movement Type

- [x] 1.2 **T-02** — Step (a): DROP `stock_movements_type_check` and ADD it back with all ten types including `egreso_reemplazo`. (~15 lines)
  - _Files_: `supabase/migrations/20260812000061_atomic_stock_work_resolution.sql`
  - _Depends on_: T-01

- [x] 1.3 **T-03** — Step (b): DROP `stock_movements_sign_matches_type` and ADD it back with `egreso_reemplazo` in the negative-quantity branch. (~20 lines)
  - _Files_: `supabase/migrations/20260812000061_atomic_stock_work_resolution.sql`
  - _Depends on_: T-02

- [x] 1.4 **T-04** — Step (c): CREATE `public.resolve_equipment_replacement(...)` with full body per design §3: serial validation, category guard, already-resolved guard, `operations.replace_equipment` call, reserva lookup, conditional `egreso_reemplazo` + `liberacion_reserva` inserts, `equipment_id` update, two-step ticket state machine. (~120 lines)
  - _Files_: `supabase/migrations/20260812000061_atomic_stock_work_resolution.sql`
  - _Depends on_: T-03

- [x] 1.5 **T-05** — Step (d): DO block backfill for historical resolved `equipment_installation` tickets with dangling `reserva` and no `egreso_instalacion`/`liberacion_reserva`. Idempotency guard on both types. Note prefix `[Backfill 000061]`. (~45 lines)
  - _Files_: `supabase/migrations/20260812000061_atomic_stock_work_resolution.sql`
  - _Depends on_: T-04

- [x] 1.6 **T-06** — Append `GRANT EXECUTE ON FUNCTION public.resolve_equipment_replacement(...) TO authenticated;` at end of migration. (~3 lines)
  - _Files_: `supabase/migrations/20260812000061_atomic_stock_work_resolution.sql`
  - _Depends on_: T-04

---

## Phase 2: SQL Smoke Test (Group D)

- [x] 2.1 **T-14** — Create `supabase/tests-sql/test_atomic_stock_work_resolution.sql` with 7 scenarios, each wrapped in `BEGIN`/`ROLLBACK`:
  - S1: `resolve_equipment_installation` happy path — reserva → egreso_instalacion + liberacion_reserva; ticket resolved; equipment created.
  - S2: `resolve_equipment_installation` with `product_id=NULL` — no movements; ticket resolves; equipment created.
  - S3: `resolve_equipment_replacement` happy path — reserva → egreso_reemplazo + liberacion_reserva; new equipment active; old dead; key_authorizations migrated.
  - S4: `resolve_equipment_replacement` with `product_id=NULL` — no movements; swap executes; ticket resolved.
  - S5: Second call on already-resolved ticket raises `P0001`; no duplicate rows.
  - S6: Backfill DO block idempotency — second run inserts zero rows.
  - S7: Temp-table nesting — `operations.replace_equipment` inside outer transaction succeeds.
  - Each scenario: `RAISE NOTICE 'PASS scenario-N: ...'`. (~90 lines)
  - _Files_: `supabase/tests-sql/test_atomic_stock_work_resolution.sql`
  - _Depends on_: T-06

---

## Phase 3: Admin Client (Group B)

- [x] 3.1 **T-07** — Create `apps/admin/src/hooks/useResolveEquipmentInstallation.ts` with `ResolveEquipmentInstallationInput` interface, `useMutation` wrapping `supabase.rpc('resolve_equipment_installation', {...})`, and cache invalidations for `['admin','tarea', ticketId]`, `tareasKey()`, and `equipmentKey(buildingId)`. Toast on success/error. (~40 lines)
  - _Files_: `apps/admin/src/hooks/useResolveEquipmentInstallation.ts`
  - _Depends on_: T-06 (RPC must exist)

- [x] 3.2 **T-08** — Create `apps/admin/src/hooks/useResolveEquipmentReplacement.ts` with `ResolveEquipmentReplacementInput` interface, `useMutation` wrapping `supabase.rpc('resolve_equipment_replacement', {...})`, same invalidations as T-07. Toast on success/error. (~45 lines)
  - _Files_: `apps/admin/src/hooks/useResolveEquipmentReplacement.ts`
  - _Depends on_: T-06

- [x] 3.3 **T-09** — Refactor `apps/admin/src/components/tareas/AssignEquipmentDialog.tsx`:
  - Import `useResolveEquipmentInstallation` and `useResolveEquipmentReplacement`.
  - `equipment_installation` branch in `onCreateSubmit` calls `useResolveEquipmentInstallation.mutateAsync` (no separate `resolve_ticket` call after).
  - `equipment_replacement` branch in `onReplaceSubmit` calls `useResolveEquipmentReplacement.mutateAsync` (no separate `resolve_ticket` call after).
  - `installation` branch keeps `createAndAssignEquipment` with explicit source comment `// installation has no product_id — generic resolve path`.
  - `maintenance` branch unchanged.
  - Remove references to retired mutations from destructuring. (~net -10 / +20 lines)
  - _Files_: `apps/admin/src/components/tareas/AssignEquipmentDialog.tsx`
  - _Depends on_: T-07, T-08

- [x] 3.4 **T-10** — Modify `apps/admin/src/hooks/useMutateTicketEquipment.ts`: remove `createAndAssignEquipment` export, `CreateAndAssignEquipmentInput` interface, `replaceEquipmentInTicket` export, and `ReplaceEquipmentInTicketInput` interface. Keep `assignExistingEquipment` and `AssignExistingEquipmentInput`. Update JSDoc. (~-60 lines) [DEVIATION: createAndAssignEquipment retained for 'installation' category per T-09 instruction; only replaceEquipmentInTicket and ReplaceEquipmentInTicketInput removed]
  - _Files_: `apps/admin/src/hooks/useMutateTicketEquipment.ts`
  - _Depends on_: T-09 (caller updated first)

- [x] 3.5 **T-11** — Grep for any remaining callers of `createAndAssignEquipment` and `replaceEquipmentInTicket` across `apps/admin/src`. Fix or delete any found. Also check `apps/admin/src/routes/tareas/TareaDetailPage.tsx` for references to retired mutations; apply minimal wiring update if present. (~0–10 lines depending on findings) [RESULT: replaceEquipmentInTicket: only JSDoc comment remains; createAndAssignEquipment retained; TareaDetailPage.tsx: no changes needed]
  - _Files_: `apps/admin/src/routes/tareas/TareaDetailPage.tsx` (likely no change)
  - _Depends on_: T-10

---

## Phase 4: Installer Client (Group C)

- [x] 4.1 **T-12** — Modify `apps/installer/src/hooks/useAssignedTickets.ts`:
  - Add `category: string` field to `AssignedTicket` interface.
  - Add `category` to the `.select(...)` string inside `fetchAssignedTickets`.
  - Add `category` to the raw row type mapping and to the returned object in the `.map()` call. (~+8 lines)
  - _Files_: `apps/installer/src/hooks/useAssignedTickets.ts`
  - _Depends on_: none (parallel with Group B)

- [x] 4.2 **T-13** — Modify `apps/installer/src/components/work/TicketsSection.tsx`:
  - Declare `EXCLUDED_FOR_BATCH: readonly string[]` = `['equipment_installation', 'equipment_replacement']`.
  - Derive `selectable` and `pendingAdmin` arrays from `sorted`.
  - Render `selectable` tickets in the existing `Collapsible`/`SelectionToolbar` flow; pass only `selectable` to `TicketCard` + toolbar count.
  - Render `pendingAdmin` tickets as read-only cards labeled "Pendiente de admin" (a simple non-selectable `TicketCard` or plain `div`).
  - `handleToggle` and `handleConfirm` operate only on `selectable`. (~+20 / -2 lines)
  - _Files_: `apps/installer/src/components/work/TicketsSection.tsx`
  - _Depends on_: T-12

---

## Phase 5: Verification (Group E)

- [x] 5.1 **T-15** — `supabase migration up --local` — migration 000061 applies cleanly with no errors. Document any constraint conflict encountered.
  - _Depends on_: T-06

- [x] 5.2 **T-16** — `psql -f supabase/tests-sql/test_atomic_stock_work_resolution.sql` — all 7 PASS notices appear; zero errors.
  - _Depends on_: T-14, T-15

- [x] 5.3 **T-17** — Regression: `psql -f supabase/tests-sql/test_resolve_ticket.sql` (4 PASS expected) and `psql -f supabase/tests-sql/test_unify_work_tracking.sql` (6 PASS expected) — zero regressions.
  - _Depends on_: T-15

- [x] 5.4 **T-18** — E2E via psql with admin JWT: create a technical order with `item_type=equipment` + product, confirm it, open the admin dialog for the `equipment_installation` ticket, call `resolve_equipment_installation` RPC directly, then verify: (a) `reserva` + `egreso_instalacion` + `liberacion_reserva` all carry the same `ticket_id`; (b) ticket `status='resolved'`; (c) `operations.equipment` row exists with new serial; (d) stock net = -qty.
  - _Depends on_: T-15, T-09

---

## Phase 6: Docs (Group F)

- [x] 6.1 **T-19** — Update `supabase/FLOWS.md`: add a paragraph under the equipment flows section explaining the atomic pattern for `equipment_installation` and `equipment_replacement`. Note that the admin (not the installer) completes these tickets. Minimal edit; do not restructure the file. (~+10 lines)
  - _Files_: `supabase/FLOWS.md`
  - _Depends on_: none (parallel with any phase)

---

## Dependency Graph

```
T-01 → T-02 → T-03 → T-04 → T-05
                      T-04 → T-06 → T-14 → T-16
                      T-06 → T-15 → T-17
                      T-06 → T-07 → T-09 → T-10 → T-11 → T-18
                      T-06 → T-08 → T-09
T-12 → T-13
T-19 (independent)
```

Parallel opportunities:
- Group B (T-07, T-08) and Group C (T-12) can proceed concurrently once the migration slot is decided (T-06 for B; T-12 has no DB dependency).
- T-19 is fully independent.
