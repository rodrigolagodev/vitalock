# Apply Progress: installer-worklist

## PR Chain Position

- **Current batch**: PR#2 (Components + Route — Phase 2)
- **Chain strategy**: stacked-to-main
- **PR#1 base**: main → cbf0248
- **PR#2 base**: cbf0248 (PR#1 merged)
- **PR#3 scope (next)**: Phase 3 task 3.9 — CI verification (not started)

---

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

**Total tests (PR#1)**: 20 passing, 0 failing.

### PR#1 Pipeline Results

| Command | Result |
|---------|--------|
| `pnpm --filter installer test` | PASS — 20 tests |
| `pnpm --filter installer typecheck` | PASS — 0 errors |
| `pnpm --filter installer lint` | PASS — 0 errors (4 pre-existing warnings in shadcn/AuthProvider files) |
| `pnpm --filter installer build` | PASS — 180 modules, clean build |

---

## Batch Completed: PR#2

### Phase 2 — Components + Route

| Task | Status | File |
|------|--------|------|
| 2.1 EmptyState.tsx | DONE | apps/installer/src/components/common/EmptyState.tsx |
| 2.2 ConnectivityBanner.tsx | DONE | apps/installer/src/components/common/ConnectivityBanner.tsx |
| 2.3 AuthorizationRow.tsx | DONE | apps/installer/src/components/work/AuthorizationRow.tsx |
| 2.4 EquipmentGroup.tsx | DONE | apps/installer/src/components/work/EquipmentGroup.tsx |
| 2.5 AuthorizationsSection.tsx | DONE | apps/installer/src/components/work/AuthorizationsSection.tsx |
| 2.6 TicketCommentsList.tsx | DONE | apps/installer/src/components/work/TicketCommentsList.tsx |
| 2.7 AddCommentForm.tsx | DONE | apps/installer/src/components/work/AddCommentForm.tsx |
| 2.8 ResolveTicketForm.tsx | DONE | apps/installer/src/components/work/ResolveTicketForm.tsx |
| 2.9 TicketCard.tsx | DONE | apps/installer/src/components/work/TicketCard.tsx |
| 2.10 TicketsSection.tsx | DONE | apps/installer/src/components/work/TicketsSection.tsx |
| 2.11 BuildingWorkCard.tsx | DONE | apps/installer/src/components/work/BuildingWorkCard.tsx |
| 2.12 Mount Toaster in main.tsx | DONE | apps/installer/src/main.tsx |
| 2.13 Replace routes/index.tsx with HomePage | DONE | apps/installer/src/routes/index.tsx |

### Key implementation details

- **Toaster**: Imported directly from `sonner` (not the shadcn wrapper) to avoid `next-themes` ThemeProvider requirement. No ThemeProvider is mounted in the installer app.
- **AuthorizationRow two-step confirm**: Local `confirming` boolean state. First tap shows "Confirmar" + optional textarea; second tap fires pessimistic mutation. Spinner blocks row on `isPending`.
- **AuthorizationsSection grouping**: Groups authorizations by `equipment.id`, sorts groups A-Z by `description` via `localeCompare('es')`.
- **TicketsSection sort**: `in_progress` before `open`; within same status, earlier `opened_at` first.
- **TicketCard comments**: `useTicketComments` only enabled when `ticketId` is non-empty (passed only when expanded) to avoid unnecessary queries on collapsed cards.
- **HomePage merge**: `mergeIntoBuildings` builds a Map keyed by `building.id`, iterating authorizations then tickets. Sorted A-Z by building name. Both hooks' loading states checked separately; `isLoading` true only when data has never arrived.
- **ResolveTicketForm**: Two-step via local `expanded` boolean. RHF+Zod with `zodResolver`. `resolution_notes` min(1) with Spanish message.

### PR#2 Pipeline Results

| Command | Result |
|---------|--------|
| `pnpm --filter installer test` | PASS — 20/20 tests (no regression) |
| `pnpm --filter installer typecheck` | PASS — 0 errors |
| `pnpm --filter installer lint` | PASS — 0 errors (4 pre-existing warnings unchanged) |
| `pnpm --filter installer build` | PASS — 1997 modules, clean build |

## Work Unit Evidence (PR#2)

| Evidence | Result |
|----------|--------|
| Focused test command | `pnpm --filter installer test` → 20/20 pass, no regression |
| Build command | `pnpm --filter installer build` → 1997 modules, no errors |
| Typecheck | `pnpm --filter installer typecheck` → clean |
| Runtime harness | `pnpm --filter installer build` confirms full app compiles; visual verification requires `supabase start && pnpm --filter installer dev` + login as Bruno |
| Rollback boundary | Revert: `apps/installer/src/routes/index.tsx`, `apps/installer/src/main.tsx`, all files in `apps/installer/src/components/common/` and `apps/installer/src/components/work/`. App reverts to placeholder home. Hook tests unaffected. |

## Deviations from Design

1. **Nested embed PGRST200** (PR#1, unchanged): two-step flat fetch is the primary code path.
2. **`support.tickets` has no `title` column** (PR#1, unchanged): `title` maps to `description`.
3. **`lucide-react` added as dependency** (PR#1, unchanged): required by shadcn sonner component.
4. **`vite.config.ts` includes `globals: true`** (PR#1, unchanged): required for jest-dom binding.
5. **Toaster imported from `sonner` directly (not shadcn wrapper)**: The shadcn `Toaster` wrapper uses `useTheme` from `next-themes`, which requires a `ThemeProvider`. No `ThemeProvider` exists in the installer app. Importing directly from `sonner` avoids this without any functional difference — the same Sonner toast library is used.

## Remaining Tasks

### Phase 3 — CI (PR#3, not started)

- [ ] 3.9 Full pipeline verification

## PR Chain State

| PR | Scope | Status |
|----|-------|--------|
| PR#1 | Foundation (Phase 1 + Phase 3 tests + Phase 4 smoke) | DONE — merged at cbf0248 |
| PR#2 | Components + Route (Phase 2) | DONE — ready for commit + review |
| PR#3 | CI verification (Phase 3 task 3.9) | NOT STARTED |
