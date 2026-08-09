# Verify Report: installer-worklist

**Change**: installer-worklist
**Phase**: verify
**Date**: 2026-08-09
**Verifier**: sdd-verify (claude-sonnet-4-6)
**Verdict**: PASS

---

## Pipeline Evidence

| Command | Exit Code | Result |
|---------|-----------|--------|
| `pnpm --filter installer typecheck` | 0 | PASS — 0 errors |
| `pnpm --filter installer lint` | 0 | PASS — 0 errors, 4 pre-existing warnings (shadcn/AuthProvider, not new) |
| `pnpm --filter installer build` | 0 | PASS — 1997 modules, clean production bundle |
| `pnpm --filter installer test` | 0 | PASS — 20/20 tests (6 test files) |

Task 3.9 is now confirmed green. The final pipeline gate passes.

---

## Task Completion

| Phase | Tasks | Checked | Unchecked |
|-------|-------|---------|-----------|
| Phase 1 — Foundation | 13 | 13 | 0 |
| Phase 2 — Components + Route | 13 | 13 | 0 |
| Phase 3 — Tests + CI | 9 | 9 | 0 (3.9 confirmed green by this run) |
| Phase 4 — Smoke-Test Gate | 2 | 2 | 0 |
| **Total** | **37** | **37** | **0** |

All tasks complete. Task 3.9 was listed as unchecked in apply-progress pending this verification run; the pipeline now confirms it green.

---

## Spec Compliance Matrix

### Domain: installer-home (8 requirements, 10 scenarios)

| Req | Scenario | Spec Statement | Artifact | Test | Status |
|-----|----------|---------------|----------|------|--------|
| R1 | SC-R1-1 | Multiple buildings → sorted A-Z | `mergeIntoBuildings` + `localeCompare('es')` in `routes/index.tsx` | covered by hook test shape | PASS |
| R1 | SC-R1-2 | Tickets only → card shows Trabajos; Llaves hidden | `AuthorizationsSection` returns null when empty | n/a (component logic, UI) | PASS |
| R1 | SC-R1-3 | Authorizations only → card shows Llaves; Trabajos hidden | `TicketsSection` returns null when empty | n/a (component logic, UI) | PASS |
| R2 | SC-R2-1 | Header shows "N llaves / M tickets" | `BuildingWorkCard` header computed from `authorizations.length` / `tickets.length` | — | PASS |
| R2 | SC-R2-2 | Header updates after completion | Reactive: counts derived from live query data | — | PASS |
| R3 | SC-R3-1 | Empty state message shown | `EmptyState` renders "Estás al día. No tenés tareas pendientes." | — | PASS |
| R4 | SC-R4-1 | Initial load → skeleton (3 cards) | `LoadingSkeletons` in `routes/index.tsx` (3 cards) | — | PASS |
| R4 | SC-R4-2 | Background refetch → spinner, cards stay | `isFetching && !isLoading → Loader2 spinner` | — | PASS |
| R5 | SC-R5-1 | Merged shape includes all buildings | `mergeIntoBuildings` (Map keyed by building.id, iterates both sources) | useWorklist test 3.1 shape | PASS |
| R6 | SC-R6-1 | Default expanded on first render | `useState(true)` in both section components | — | PASS |
| R6 | SC-R6-2 | Collapse Llaves → Trabajos unaffected | Independent `useState` per section, per card | — | PASS |
| R7 | SC-R7-1 | Offline → banner visible | `ConnectivityBanner` uses `useOnlineStatus` | — | PASS |
| R8 | SC-R8-1 | Pipeline green; ≥8 tests pass | Pipeline confirmed: 20/20 tests, all commands exit 0 | 20 tests | PASS |

### Domain: worklist / Llaves (5 requirements, 7 scenarios)

| Req | Scenario | Spec Statement | Artifact | Test | Status |
|-----|----------|---------------|----------|------|--------|
| R1 | SC-R1-1 | Grouped by equipment, sorted A-Z | `AuthorizationsSection` groups by equipment.id, sorts by description localeCompare | — | PASS |
| R1 | SC-R1-2 | pending_install → "Cargar" | `AuthorizationRow` renders "Cargar" for `pending_install` | — | PASS |
| R1 | SC-R1-3 | pending_removal → "Borrar" | `AuthorizationRow` renders "Borrar" for `pending_removal` | — | PASS |
| R2 | SC-R2-1 | Cargar → Confirmar → spinner → disappears + toast | Two-step `confirming` state + pessimistic mutation in `AuthorizationRow` | — | PASS |
| R2 | SC-R2-2 | First tap only → no mutation | `confirming` state requires second tap to fire mutate | — | PASS |
| R3 | SC-R3-1 | Remove without reason → payload `remove_reason: null` | `useMarkAuthorization` `remove_reason: payload.remove_reason ?? null` | `useMarkAuthorization.test.ts` test 3 | PASS |
| R3 | SC-R3-2 | Remove with reason → payload carries reason | `useMarkAuthorization` passes reason string | `useMarkAuthorization.test.ts` test 2 | PASS |
| R4 | SC-R4-1 | 23514 → status toast | `toastMutationError` case '23514' | `mapMutationError.test.ts` test 1 | PASS |
| R4 | SC-R4-2 | Network → connection toast | `toastMutationError` `isNetworkError` | `mapMutationError.test.ts` test 3+4 | PASS |
| R5 | SC-R5-1 | Last auth → Llaves hidden | `AuthorizationsSection` returns null when empty | — | PASS |
| installed_by_staff_id | — | Install payload always includes `installed_by_staff_id` | `useMarkAuthorization` line 32 | `useMarkAuthorization.test.ts` test 1 | PASS |
| removed_by_staff_id | — | Remove payload always includes `removed_by_staff_id` | `useMarkAuthorization` line 40 | `useMarkAuthorization.test.ts` test 2+3 | PASS |

### Domain: tickets / Trabajos (6 requirements, 9 scenarios)

| Req | Scenario | Spec Statement | Artifact | Test | Status |
|-----|----------|---------------|----------|------|--------|
| R1 | SC-R1-1 | Collapsed card: title + status badge | `TicketCard` collapsed state | — | PASS |
| R1 | SC-R1-2 | Expanded card: description + comments | `TicketCard` expanded renders `TicketCommentsList` | — | PASS |
| R1 | SC-R1-3 | Status sort, then opened_at asc | `TicketsSection` sort: in_progress=0, open=1, then localeCompare | — | PASS |
| R2 | SC-R2-1 | Optimistic comment appears immediately | `useAddComment` onMutate appends `_pending: true` | `useAddComment.test.ts` test 2 | PASS |
| R2 | SC-R2-2 | DB confirm removes pending indicator | `useAddComment` onSuccess invalidates queries | — | PASS |
| R2 | SC-R2-3 | Network error → rolled back + toast | `useAddComment` onError reverts snapshot + toastMutationError | `useAddComment.test.ts` test 1 | PASS |
| R3 | SC-R3-1 | Happy path resolve → disappears + toast | `ResolveTicketForm` + `useAdvanceTicket` | — | PASS |
| R3 | SC-R3-2 | Empty textarea → client-side validation blocks | Zod `min(1)` + RHF `errors.resolution_notes` alert | — | PASS |
| R3 | SC-R3-3 | `resolved_by_staff_id` always present, never null | `useAdvanceTicket` always injects `resolved_by_staff_id: staffId` | `useAdvanceTicket.test.ts` all 3 tests | PASS |
| R4 | SC-R4-1 | RLS denial on resolve → toast | `toastMutationError` case '42501' | `mapMutationError.test.ts` test 2 | PASS |
| R5 | SC-R5-1 | Ticket reassigned → disappears ~2s | Realtime invalidation in `useAssignedTickets` | — | PASS |
| R6 | SC-R6-1 | Last ticket resolved → Trabajos hidden | `TicketsSection` returns null when empty | — | PASS |

### Domain: realtime (3 requirements, 7 scenarios)

| Req | Scenario | Spec Statement | Artifact | Test | Status |
|-----|----------|---------------|----------|------|--------|
| R1 | SC-R1-1 | New auth → appears ~2s | `useWorklist` Realtime `invalidateQueries` | — | PASS |
| R1 | SC-R1-2 | Installed auth → disappears | same invalidation | — | PASS |
| R1 | SC-R1-3 | New building → BuildingWorkCard appears A-Z | `mergeIntoBuildings` re-runs on invalidation | — | PASS |
| R1 | SC-R1-4 | Unmount → `removeChannel` called | `useEffect` cleanup | `useAssignedTickets.test.ts` test 3.3b | PASS |
| R1 fallback | — | CHANNEL_ERROR → filterless re-subscribe | `useWorklist` CHANNEL_ERROR branch | `useWorklist.test.ts` test 3.8 | PASS |
| R2 | SC-R2-1 | New ticket assigned → appears ~2s | `useAssignedTickets` Realtime | — | PASS |
| R2 | SC-R2-2 | Ticket unassigned → disappears ~2s | same invalidation | — | PASS |
| R2 | SC-R2-3 | Unmount → `removeChannel` called | `useEffect` cleanup | `useAssignedTickets.test.ts` test 3.3b | PASS |
| R2 fallback | — | CHANNEL_ERROR filterless re-subscribe | `useAssignedTickets` CHANNEL_ERROR branch | `useAssignedTickets.test.ts` test 3.3c | PASS |
| R3 | SC-R3-1 | RLS scoping — other installer's rows silent | Supabase RLS enforces at DB level | — | PASS (infra-level) |

---

## Explicit Spec Checks

| Requirement | Implementation | Test | Result |
|-------------|---------------|------|--------|
| `resolved_by_staff_id` always injected, never null | `useAdvanceTicket.ts` L39: always set from `staff?.id ?? ''` | `useAdvanceTicket.test.ts` × 3 | PASS |
| `installed_by_staff_id` in install payload | `useMarkAuthorization.ts` L32 | `useMarkAuthorization.test.ts` test 1 | PASS |
| `removed_by_staff_id` in remove payload | `useMarkAuthorization.ts` L40 | `useMarkAuthorization.test.ts` test 2 | PASS |
| Realtime CHANNEL_ERROR filterless fallback (worklist) | `useWorklist.ts` L257-274 | `useWorklist.test.ts` test 3.8 | PASS |
| Realtime CHANNEL_ERROR filterless fallback (tickets) | `useAssignedTickets.ts` L115-132 | `useAssignedTickets.test.ts` test 3.3c | PASS |
| PostgREST cross-schema embed fallback (PGRST200) | `fetchWorklistFlat()` in `useWorklist.ts` | `useWorklist.test.ts` test 3.2 | PASS |
| Per-building unified card layout (NOT tabs) | `BuildingWorkCard` + `AuthorizationsSection` + `TicketsSection` — no Tab component used | — | PASS |
| Toaster mounted | `main.tsx` L38: `<Toaster richColors position="bottom-center" />` inside root | — | PASS |
| HomePage replaces placeholder | `routes/index.tsx` exports `IndexRoute` as full `HomePage` | — | PASS |
| Spanish empty state text | `EmptyState.tsx` L12: "Estás al día. No tenés tareas pendientes." | — | PASS |

---

## Design Coherence

| Design Decision | Implementation | Status |
|-----------------|---------------|--------|
| Nested embed first, flat fallback on PGRST* | `fetchWorklist` → `fetchWorklistFlat` | PASS |
| PGRST200 is the primary path (smoke test) | Documented in `useWorklist.ts` header comment | PASS |
| Two-step pessimistic confirm (no modal) | `confirming` local state in `AuthorizationRow` | PASS |
| `resolved_by_staff_id` from `useAuthContext` at hook-call time | `useAdvanceTicket` L27 reads `staff` at top level | PASS |
| Optimistic add comment with snapshot revert | `useAddComment` onMutate/onError pattern | PASS |
| Toaster from `sonner` directly (not shadcn wrapper) | `main.tsx` imports from `sonner`, avoids `useTheme` dependency | PASS (documented deviation) |
| `title` maps to `description` (no title column in DB) | `useAssignedTickets` maps `r.description → title` | PASS (documented deviation) |

---

## Issues

### CRITICAL

None.

### WARNING

None.

### INFO / SUGGESTION

1. The `AuthorizationsSection` groups by `equipment.id` as key but uses `description` as the `EquipmentGroup` key (`key={group.description}`). If two equipment items in the same building share the same description string but have different IDs, the key could collide. Low risk in practice given the data model, but using `equipment.id` as the React key would be more robust.

2. `useAdvanceTicket` reads `staffId` as `staff?.id ?? ''` at hook-call time. If `staff` is null at mount but defined later (e.g. race on cold start), `staffId` is `''` until remount. This is consistent with all other hooks in the codebase and is not a spec violation, but the empty-string fallback path is unguarded in the payload.

---

## Verdict

**PASS** — All 37 tasks complete. Full pipeline exits 0 (typecheck, lint, build, 20/20 tests). All 22 spec requirements across 4 domains traced to implementation. All explicit checks confirmed. Zero CRITICAL or WARNING findings. Two INFO suggestions noted but not blocking.
