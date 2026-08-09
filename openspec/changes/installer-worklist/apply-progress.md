# Apply Progress: installer-worklist

## PR Chain Position

- **Current batch**: PR#1 (Foundation — Phase 4 smoke gate + Phase 1 deps/hooks + Phase 3 hook tests)
- **Chain strategy**: stacked-to-main
- **PR#2 scope (next batch)**: Phase 2 — components + route (not started)
- **PR#3 scope (future)**: Phase 3 CI verification task 3.9 (not started)

## Batch Completed: PR#1

### Phase 4 — Smoke-Test Gate

| Task | Status | Evidence |
|------|--------|---------|
| 4.1 Nested embed cross-schema FK test | DONE | PGRST200 confirmed. FK operations.equipment.building_id → public.buildings NOT in PostgREST schema cache. Two-step flat fetch is the primary path. Documented prominently in useWorklist.ts header comment. |
| 4.2 Realtime filter validation | DONE | Filterless fallback documented in useWorklist.ts and covered by test 3.8. CHANNEL_ERROR triggers re-subscribe without filter; invalidateQueries fires on any event. |

**Critical finding from smoke test**: The nested embed is NOT viable in the current deployment. The two-step flat fetch (fallback) is the actual primary code path. The hook retains the nested embed attempt so it auto-upgrades if the FK is ever added to PostgREST's schema cache.

### Phase 1 — Foundation

| Task | Status | File |
|------|--------|------|
| 1.1 Add deps (sonner, @testing-library/react, user-event, jsdom) | DONE | apps/installer/package.json |
| 1.2 Add test.environment jsdom + setupFiles to vite.config.ts | DONE | apps/installer/vite.config.ts |
| 1.3 Create test/setup.ts | DONE | apps/installer/src/test/setup.ts |
| 1.4 shadcn add card badge skeleton collapsible textarea sonner separator | DONE | apps/installer/src/components/ui/{card,badge,skeleton,collapsible,textarea,sonner,separator}.tsx |
| 1.5 Create queryKeys.ts | DONE | apps/installer/src/lib/queryKeys.ts |
| 1.6 Create mapMutationError.ts | DONE | apps/installer/src/hooks/mapMutationError.ts |
| 1.7 Create useOnlineStatus.ts | DONE | apps/installer/src/hooks/useOnlineStatus.ts |
| 1.8 Create useWorklist.ts | DONE | apps/installer/src/hooks/useWorklist.ts |
| 1.9 Create useAssignedTickets.ts | DONE | apps/installer/src/hooks/useAssignedTickets.ts |
| 1.10 Create useTicketComments.ts | DONE | apps/installer/src/hooks/useTicketComments.ts |
| 1.11 Create useMarkAuthorization.ts | DONE | apps/installer/src/hooks/useMarkAuthorization.ts |
| 1.12 Create useAdvanceTicket.ts | DONE | apps/installer/src/hooks/useAdvanceTicket.ts |
| 1.13 Create useAddComment.ts | DONE | apps/installer/src/hooks/useAddComment.ts |

### Phase 3 — Hook Tests

| Task | Status | Tests | File |
|------|--------|-------|------|
| 3.1 useWorklist happy path | DONE | 1 test | useWorklist.test.ts |
| 3.2 Embed fallback (PGRST200) | DONE | 1 test | useWorklist.test.ts |
| 3.3 useAssignedTickets scoping + cleanup + CHANNEL_ERROR | DONE | 3 tests | useAssignedTickets.test.ts |
| 3.4 useMarkAuthorization payload (install, remove, remove null) | DONE | 3 tests | useMarkAuthorization.test.ts |
| 3.5 useAdvanceTicket resolved_by_staff_id contract | DONE | 3 tests | useAdvanceTicket.test.ts |
| 3.6 useAddComment optimistic rollback | DONE | 2 tests | useAddComment.test.ts |
| 3.7 mapMutationError SQLSTATE mapping | DONE | 6 tests | mapMutationError.test.ts |
| 3.8 Realtime filterless fallback simulation | DONE | 1 test | useWorklist.test.ts |

**Total tests**: 20 passing, 0 failing.

## Work Unit Evidence

| Evidence | Result |
|----------|--------|
| Focused test command | `pnpm --filter installer test` → 20/20 tests pass, 6 test files |
| Runtime harness | `supabase start` running; Phase 4 smoke confirmed DB accessible and seed data present; flat fetch approach validated |
| Rollback boundary | Revert all files in `apps/installer/src/hooks/`, `apps/installer/src/lib/queryKeys.ts`, `apps/installer/src/test/setup.ts`, `apps/installer/src/components/ui/{card,badge,skeleton,collapsible,textarea,sonner,separator}.tsx`, `apps/installer/vite.config.ts`, `apps/installer/package.json`. No UI change visible. |

## Pipeline Results (PR#1 gate)

| Command | Result |
|---------|--------|
| `pnpm --filter installer test` | PASS — 20 tests |
| `pnpm --filter installer typecheck` | PASS — 0 errors |
| `pnpm --filter installer lint` | PASS — 0 errors (4 pre-existing warnings in shadcn/AuthProvider files) |
| `pnpm --filter installer build` | PASS — 180 modules, clean build |

## Deviations from Design

1. **Nested embed is not viable (PGRST200)**: The smoke test confirmed that the cross-schema FK `operations.equipment.building_id → public.buildings` is not in PostgREST's schema cache. The design said "attempt nested embed first, fallback on PGRST200" — that is exactly what the hook does, but in practice the fallback fires every time. This is documented in `useWorklist.ts` with a prominent comment. Test 3.2 covers this exact scenario.

2. **`support.tickets` has no `title` column**: Only `description` exists. The `AssignedTicket` interface uses `description` as `title` (both fields map to the same DB column). This is noted in `useAssignedTickets.ts` comments.

3. **`lucide-react` added as dependency**: The shadcn `sonner` component imports from `lucide-react`. This was installed automatically.

4. **`vite.config.ts` includes `globals: true`**: Required for `@testing-library/jest-dom` to bind `expect` before Vitest's own setup runs. This is the standard Vitest + jest-dom pattern.

## Remaining Tasks

### Phase 2 — Components + Route (PR#2, not started)

- [ ] 2.1 EmptyState.tsx
- [ ] 2.2 ConnectivityBanner.tsx
- [ ] 2.3 AuthorizationRow.tsx
- [ ] 2.4 EquipmentGroup.tsx
- [ ] 2.5 AuthorizationsSection.tsx
- [ ] 2.6 TicketCommentsList.tsx
- [ ] 2.7 AddCommentForm.tsx
- [ ] 2.8 ResolveTicketForm.tsx
- [ ] 2.9 TicketCard.tsx
- [ ] 2.10 TicketsSection.tsx
- [ ] 2.11 BuildingWorkCard.tsx
- [ ] 2.12 Mount Toaster in main.tsx
- [ ] 2.13 Replace routes/index.tsx with HomePage

### Phase 3 — CI (PR#3, not started)

- [ ] 3.9 Full pipeline verification
