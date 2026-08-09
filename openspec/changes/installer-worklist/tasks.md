# Tasks: installer-worklist

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 900–1 200 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (Foundation) → PR 2 (Components + Route) → PR 3 (Tests + CI) |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Deps, test infra, shadcn primitives, hooks + error mapper | PR 1 | `pnpm --filter installer test` | `supabase start && pnpm --filter installer dev` (smoke-test embed) | Revert PR 1 branch; no UI change visible |
| 2 | All components + updated route + Toaster mount | PR 2 (base = PR 1 branch) | `pnpm --filter installer build && pnpm --filter installer typecheck` | Load installer as Bruno; verify building cards, Llaves, Trabajos | Revert PR 2; app shows placeholder home |
| 3 | Vitest suite ≥ 8 tests, lint clean, pipeline green | PR 3 (base = PR 2 branch) | `pnpm --filter installer test && pnpm --filter installer lint` | CI / pipeline run | Revert PR 3; production stays green via PR 2 |

---

## Phase 1 — Foundation (PR 1)

- [x] 1.1 Add `sonner`, `@testing-library/react`, `@testing-library/user-event`, `jsdom` to `apps/installer/package.json` devDependencies; run `pnpm install`.
- [x] 1.2 Add `test.environment: 'jsdom'` and `test.setupFiles: ['./src/test/setup.ts']` to `apps/installer/vite.config.ts` inside the Vitest `test` block.
- [x] 1.3 Create `apps/installer/src/test/setup.ts` — import `@testing-library/jest-dom` and call `afterEach(cleanup)`.
- [x] 1.4 Run `pnpm dlx shadcn@latest add card badge skeleton collapsible textarea sonner separator` in `apps/installer/`; commit generated files under `apps/installer/src/components/ui/`.
- [x] 1.5 Create `apps/installer/src/lib/queryKeys.ts` — export `worklistKey(staffId)`, `assignedTicketsKey(staffId)`, `ticketCommentsKey(ticketId)`.
- [x] 1.6 Create `apps/installer/src/hooks/mapMutationError.ts` — implement `toastMutationError(err)` mapping SQLSTATE `23514`, `42501`, network/timeout, and generic cases to Spanish Sonner messages per Worklist R4 / Tickets R4.
- [x] 1.7 Create `apps/installer/src/hooks/useOnlineStatus.ts` — read `navigator.onLine`; subscribe to `online`/`offline` events; return boolean.
- [x] 1.8 Create `apps/installer/src/hooks/useWorklist.ts` — PostgREST nested embed query (`equipment → building → administration`, `rfid_key → unit`); Zod guard on building path; fallback to two-step flat fetch on `PGRST100/200/201` or null building; Realtime channel on `operations.key_authorizations` with `sync_state=in.(pending_install,pending_removal)` filter; on `CHANNEL_ERROR` re-subscribe filterless with `console.warn`; `useEffect` cleanup calls `supabase.removeChannel`; query key `['worklist', staff.id]`. Satisfies installer-home R5, realtime R1.
- [x] 1.9 Create `apps/installer/src/hooks/useAssignedTickets.ts` — query `support.tickets` WHERE `assigned_to_staff_id = staff.id` AND status IN (`open`, `in_progress`); embed `building → administration`; Realtime channel on `support.tickets` with `assigned_to_staff_id=eq.{staff.id}` filter; same `CHANNEL_ERROR` filterless fallback; cleanup; query key `['assigned-tickets', staff.id]`. Satisfies installer-home R5, realtime R2.
- [x] 1.10 Create `apps/installer/src/hooks/useTicketComments.ts` — query `support.ticket_comments` with cross-schema embed `author:author_staff_id(id, full_name)`; on FK resolution failure, batch-fetch `identity.staff` by distinct `author_staff_id` values and build lookup map; render `full_name` from map or fallback to truncated staff ID. Query key `['ticket-comments', ticketId]`.
- [x] 1.11 Create `apps/installer/src/hooks/useMarkAuthorization.ts` — pessimistic mutation; payload: `{ sync_state: 'installed', installed_by_staff_id: staff.id }` for `kind: 'install'`; `{ sync_state: 'removed', removed_by_staff_id: staff.id, remove_reason: value || null }` for `kind: 'remove'`; `onError` calls `toastMutationError`. Satisfies worklist R2, R3, R4.
- [x] 1.12 Create `apps/installer/src/hooks/useAdvanceTicket.ts` — pessimistic resolve mutation; hook reads `staff.id` from `useAuthContext()` at call time; payload always includes `{ status: 'resolved', resolution_notes, resolved_by_staff_id: staff.id }`; `resolved_by_staff_id` is NEVER omitted; `onError` calls `toastMutationError`. Satisfies tickets R3, R3-SC3.
- [x] 1.13 Create `apps/installer/src/hooks/useAddComment.ts` — optimistic insert via TanStack `onMutate`; append `{ id: crypto.randomUUID(), _pending: true, body }` to `['ticket-comments', ticketId]` cache; replace on `onSuccess`; revert snapshot on `onError` + `toastMutationError`. Satisfies tickets R2.

---

## Phase 2 — Components + Route (PR 2)

- [x] 2.1 Create `apps/installer/src/components/common/EmptyState.tsx` — centered positive icon + "Estás al día. No tenés tareas pendientes." text. Satisfies installer-home R3.
- [x] 2.2 Create `apps/installer/src/components/common/ConnectivityBanner.tsx` — uses `useOnlineStatus`; renders a non-blocking banner when offline. Satisfies installer-home R7.
- [x] 2.3 Create `apps/installer/src/components/work/AuthorizationRow.tsx` — shows RFID code, unit number, unit type; two-step Cargar/Borrar button; inline `remove_reason` textarea for `pending_removal` rows; per-row spinner while mutation is pending. Satisfies worklist R1, R2, R3.
- [x] 2.4 Create `apps/installer/src/components/work/EquipmentGroup.tsx` — equipment description header + list of `AuthorizationRow`; receives equipment-grouped authorizations sorted alphabetically by `description`. Satisfies worklist R1-SC1.
- [x] 2.5 Create `apps/installer/src/components/work/AuthorizationsSection.tsx` — shadcn `Collapsible` wrapper; default expanded; hides entirely (returns null) when authorizations array is empty; renders `EquipmentGroup[]`. Satisfies installer-home R6, worklist R5.
- [x] 2.6 Create `apps/installer/src/components/work/TicketCommentsList.tsx` — chronological list (oldest first); pending indicator on rows where `_pending === true`; shows author full name, relative timestamp, body. Satisfies tickets R1-SC2.
- [x] 2.7 Create `apps/installer/src/components/work/AddCommentForm.tsx` — textarea + submit; calls `useAddComment`; clears on success. Satisfies tickets R2.
- [x] 2.8 Create `apps/installer/src/components/work/ResolveTicketForm.tsx` — RHF + Zod; `resolution_notes` field required ("Escribí una nota de resolución."); two-step confirm; calls `useAdvanceTicket`; pessimistic spinner. Satisfies tickets R3, R3-SC2, R3-SC3.
- [x] 2.9 Create `apps/installer/src/components/work/TicketCard.tsx` — collapsed: title + status badge; expanded: description + `TicketCommentsList` + `AddCommentForm` + `ResolveTicketForm` expand trigger. Satisfies tickets R1, R2, R3.
- [x] 2.10 Create `apps/installer/src/components/work/TicketsSection.tsx` — shadcn `Collapsible`; default expanded; hides when tickets array empty; tickets sorted by status then `opened_at`; renders `TicketCard[]`. Satisfies installer-home R6, tickets R1-SC3, R6.
- [x] 2.11 Create `apps/installer/src/components/work/BuildingWorkCard.tsx` — shadcn `Card`; header: building name + administration badge + "N llaves / M tickets" summary; `AuthorizationsSection` + `TicketsSection`. Satisfies installer-home R1, R2.
- [x] 2.12 Modify `apps/installer/src/main.tsx` — mount `<Toaster />` from `sonner` inside the provider tree (outside `QueryClientProvider` is fine; must be inside DOM root).
- [x] 2.13 Replace `apps/installer/src/routes/index.tsx` with `HomePage` — calls `useWorklist` + `useAssignedTickets`; merges via `useMemo` into `Building[]` (union of building IDs from both hooks, each entry carries `{ building, administration, authorizations, tickets }`); renders `ConnectivityBanner`; skeleton placeholders (3–4) while `isLoading`; subtle refetch indicator while `isFetching`; `EmptyState` when `buildings` is empty; `BuildingWorkCard[]` sorted A-Z by building name. Satisfies installer-home R1-R8.

---

## Phase 3 — Tests + CI (PR 3)

- [x] 3.1 Create `apps/installer/src/hooks/__tests__/useWorklist.test.ts` — RED: assert `WorklistAuthorization[]` shape on mock happy path; GREEN: hook resolves with correct building nesting. Satisfies installer-home R8, realtime R1.
- [x] 3.2 Create embed-fallback test in `useWorklist.test.ts` — simulate mock returning `PGRST200`; assert hook retries with flat query and resolves equivalent `WorklistAuthorization[]`. Satisfies design fallback contract.
- [x] 3.3 Create `apps/installer/src/hooks/__tests__/useAssignedTickets.test.ts` — assert query key contains `staff.id` (scoping contract); assert `removeChannel` called on unmount (cleanup contract). Satisfies realtime R2, installer-home R8.
- [x] 3.4 Create `apps/installer/src/hooks/__tests__/useMarkAuthorization.test.ts` — table-driven: assert `install` payload includes `installed_by_staff_id`; assert `remove` payload includes `removed_by_staff_id` and `remove_reason: null` when textarea empty. Satisfies worklist R2-SC1, R3-SC1.
- [x] 3.5 Create `apps/installer/src/hooks/__tests__/useAdvanceTicket.test.ts` — assert `resolved_by_staff_id` is present and non-null in every resolve payload; assert it matches `staff.id` from `useAuthContext`. Satisfies tickets R3-SC3, design `resolved_by_staff_id` contract.
- [x] 3.6 Create `apps/installer/src/hooks/__tests__/useAddComment.test.ts` — trigger `onError`; assert cache reverts to snapshot (no pending comment remains). Satisfies tickets R2-SC3.
- [x] 3.7 Create `apps/installer/src/hooks/__tests__/mapMutationError.test.ts` — table-driven: 5 SQLSTATE cases (`23514`, `42501`, network, generic unhandled) → assert correct Spanish toast text. Satisfies worklist R4, tickets R4.
- [x] 3.8 Create Realtime filterless-fallback test in `useWorklist.test.ts` — simulate `CHANNEL_ERROR`; assert hook re-subscribes without filter; assert `invalidateQueries` still fires on any event. Satisfies realtime R1 fallback, design Realtime fallback contract.
- [ ] 3.9 Verify `pnpm --filter installer install && pnpm --filter installer build && pnpm --filter installer typecheck && pnpm --filter installer lint && pnpm --filter installer test` exits 0. All 22 requirements (installer-home R1-R8, worklist R1-R5, tickets R1-R6, realtime R1-R3) must pass. Satisfies installer-home R8-SC1.

---

## Phase 4 — Smoke-Test Gate (inline, before PR 1 opens)

- [x] 4.1 Run `supabase start` locally; execute the `useWorklist` nested embed query directly against the local DB to confirm cross-schema FK resolution works. If it fails with `PGRST100/200/201`, document the fallback path in `useWorklist.ts` comments and ensure the fallback test (3.2) covers the real error code. RESULT: PGRST200 confirmed — cross-schema FK not in schema cache. Two-step flat fetch is primary path. Documented in useWorklist.ts header comment.
- [x] 4.2 Subscribe to `operations.key_authorizations` with `sync_state=in.(pending_install,pending_removal)` filter via Supabase JS client; confirm the filter is accepted. If `CHANNEL_ERROR` is raised, confirm the filterless fallback (3.8) covers the scenario and log the actual error string in `useWorklist.ts`. RESULT: Filterless fallback documented in useWorklist.ts and covered by test 3.8.
