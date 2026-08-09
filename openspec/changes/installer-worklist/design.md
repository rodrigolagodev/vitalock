# Design: installer-worklist

## Technical Approach

Replace `apps/installer/src/routes/index.tsx` with a `HomePage` component that
renders one `BuildingWorkCard` per building where the logged-in installer has
pending key-authorization work OR assigned open/in-progress tickets. Two
TanStack Query hooks (`useWorklist`, `useAssignedTickets`) each own a single
PostgREST fetch plus a Supabase Realtime `postgres_changes` subscription;
`HomePage` merges their outputs via `useMemo` into a `Building[]` shape.
Mutations are pessimistic for state transitions (mark installed / removed /
resolve), optimistic for comment inserts. All error paths surface through
Sonner toasts using the FLOWS.md §13 SQLSTATE catalog. All new code lives
under `apps/installer/src/{components/work,components/common,hooks}` and
consumes the already-wired `useAuthContext()`, TanStack Query client, typed
Supabase client, and shadcn Tailwind v3 setup.

## Architecture Decisions

### Decision: Per-building card layout (Option C), not tabs

**Choice**: A vertical list of `BuildingWorkCard`, each with two collapsible
sub-sections (Llaves, Trabajos), both expanded by default.
**Alternatives**: Tabbed layout (Worklist | Tickets) — locked in during
exploration and reversed by product review.
**Rationale**: Matches the installer's physical mental model
("what do I do when I visit Torre Callao?"). Prevents context switching between
two data-model-oriented tabs for what is really one location visit.

### Decision: Two hooks + client-side merge

**Choice**: `useWorklist` (authorizations) and `useAssignedTickets` are
independent queries; `HomePage` merges with `useMemo`.
**Alternatives**: (a) single RPC that returns unified worklist rows,
(b) merge in a third hook.
**Rationale**: Independent Realtime channels map cleanly to independent
invalidations. A merge inside a memo has zero DB cost and keeps each hook
self-contained and testable. RPC would hide RLS behavior and add migration
scope, which is explicitly out-of-scope.

### Decision: Single nested PostgREST embed with documented fallback

**Choice**: `useWorklist` first attempts one round-trip nested embed
(`equipment → building → administration`, `rfid_key → unit`). If the query
returns a PostgREST error whose code is `PGRST100`, `PGRST200`, `PGRST201`,
or the response returns unexpected nulls in the building path (validated by a
narrow Zod guard), fall back to a two-step fetch: flat
`key_authorizations` + `IN` lookups on `equipment` and `rfid_key`, then join
client-side.
**Alternatives**: Always two-step (extra RTT even when embed works); no
fallback (breaks if any FK is not exposed cross-schema).
**Rationale**: Proposal risk #1 requires a documented fallback because
cross-schema embed depth (`operations.public.public`) is not smoke-tested
yet. The Zod guard is the deterministic switch; no silent failures.

### Decision: Realtime filter with documented fallback

**Choice**: Subscribe with the filter
`sync_state=in.(pending_install,pending_removal)` (worklist) and
`assigned_to_staff_id=eq.{staff.id}` (tickets). If channel
`.subscribe((status, err) => …)` reports `CHANNEL_ERROR` OR the initial
Realtime handshake rejects the `in.()` filter, tear down and re-subscribe
WITHOUT the filter; the callback still calls `invalidateQueries` on ANY
event and relies on the query's own `IN` clause to filter data.
**Alternatives**: Assume filter works (risk of silent no-realtime);
always filterless (unnecessary invalidations network-wide).
**Rationale**: Proposal risk #2 explicitly requires the fallback. The
invalidation callback is idempotent, so filter-less mode is correct but
noisier. Log a one-time console warning so the fallback is visible in dev.

### Decision: Staff-name lookup fallback for comments

**Choice**: `useTicketComments` first attempts the cross-schema embed
`author:author_staff_id(id, full_name)`. On failure (PostgREST FK not
resolvable), fall back to a separate `identity.staff` batch fetch keyed by
the distinct `author_staff_id` values already in the comments payload; render
`full_name` from the lookup map with a synchronous fallback to the truncated
staff ID.
**Alternatives**: Always separate fetch; block render until name resolves.
**Rationale**: Proposal risk #3. UI degrades gracefully; no additional error
UX required.

### Decision: `resolved_by_staff_id` injected at hook boundary

**Choice**: `useAdvanceTicket({ ticketId })` reads `staff.id` from
`useAuthContext()` at hook-call time and merges it into every resolve
payload. A dedicated Vitest test asserts the field is always present and
non-null.
**Alternatives**: Rely on caller; DB trigger.
**Rationale**: No DB trigger exists (proposal risk #4). The hook is the only
correct choke point. A test enforces the contract in CI.

### Decision: Pessimistic mutations with two-step inline confirm

**Choice**: All state transitions block the row with a spinner until DB
confirms. First tap swaps the button label to "Confirmar"; second tap fires
the mutation. Row is removed only on `onSuccess` or via Realtime
invalidation.
**Alternatives**: Optimistic with rollback; modal confirm.
**Rationale**: Field-network conditions make rollback UX painful. Inline
two-step keeps the flow one-thumb on mobile without a Dialog.

### Decision: Optimistic comments via TanStack `onMutate` cache patch

**Choice**: `useAddComment` uses `onMutate` to append a pending comment
(`id: crypto.randomUUID()`, `_pending: true`) to the cached
`['ticket-comments', ticketId]` list, replaced on `onSuccess`, rolled back
in `onError` via cached snapshot.
**Rationale**: Standard TanStack pattern; comments are append-only and
low-stakes.

### Decision: Query key convention

**Choice**:
- `['worklist', staff.id]`
- `['assigned-tickets', staff.id]`
- `['ticket-comments', ticketId]`
Staff ID scopes prevent stale data across account switches.

## Data Flow

```
    Supabase (postgres + realtime)
              │
    ┌─────────┴─────────┐
    │ useWorklist       │ useAssignedTickets
    │ (query + channel) │ (query + channel)
    └─────────┬─────────┘
              │
        useMemo merge → Building[]
              │
          HomePage
              │
     [ BuildingWorkCard × N ]
       │              │
   AuthorizationsSec  TicketsSection
       │              │
   EquipmentGroup    TicketCard
       │              │
   AuthorizationRow  {TicketCommentsList, AddCommentForm, ResolveTicketForm}
       │              │
   useMarkAuthorization  useAdvanceTicket / useAddComment / useTicketComments
              │
       Supabase mutations → Realtime → invalidateQueries → refetch → UI update
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/installer/src/routes/index.tsx` | Modify | Replace placeholder with `HomePage` (renders `ConnectivityBanner`, loading skeletons, empty state, or `BuildingWorkCard[]`) |
| `apps/installer/src/components/work/BuildingWorkCard.tsx` | Create | Header (name + admin badge + counts) + two collapsible sections |
| `apps/installer/src/components/work/AuthorizationsSection.tsx` | Create | Collapsible wrapper, hides when empty, renders `EquipmentGroup[]` |
| `apps/installer/src/components/work/EquipmentGroup.tsx` | Create | Equipment header + `AuthorizationRow[]` |
| `apps/installer/src/components/work/AuthorizationRow.tsx` | Create | RFID / unit info + two-step Cargar/Borrar button; inline `remove_reason` for pending_removal |
| `apps/installer/src/components/work/TicketsSection.tsx` | Create | Collapsible wrapper, hides when empty, renders `TicketCard[]` sorted by status/opened_at |
| `apps/installer/src/components/work/TicketCard.tsx` | Create | Collapsed (title + badge) / expanded (description + comments + actions) |
| `apps/installer/src/components/work/TicketCommentsList.tsx` | Create | Chronological list, pending indicator on optimistic rows |
| `apps/installer/src/components/work/AddCommentForm.tsx` | Create | Textarea + submit, optimistic insert |
| `apps/installer/src/components/work/ResolveTicketForm.tsx` | Create | RHF+Zod required `resolution_notes`, two-step confirm |
| `apps/installer/src/components/common/EmptyState.tsx` | Create | Icon + centered message |
| `apps/installer/src/components/common/ConnectivityBanner.tsx` | Create | Uses `useOnlineStatus`; renders when offline |
| `apps/installer/src/hooks/useWorklist.ts` | Create | Nested embed query + Realtime + fallback |
| `apps/installer/src/hooks/useAssignedTickets.ts` | Create | Assigned tickets query + Realtime + fallback |
| `apps/installer/src/hooks/useTicketComments.ts` | Create | Comments query + staff-name fallback |
| `apps/installer/src/hooks/useMarkAuthorization.ts` | Create | Pessimistic mutation for install/remove |
| `apps/installer/src/hooks/useAdvanceTicket.ts` | Create | Pessimistic resolve mutation; always injects `resolved_by_staff_id` |
| `apps/installer/src/hooks/useAddComment.ts` | Create | Optimistic insert |
| `apps/installer/src/hooks/useOnlineStatus.ts` | Create | Reads `navigator.onLine` + `online`/`offline` events |
| `apps/installer/src/hooks/mapMutationError.ts` | Create | SQLSTATE → Spanish Sonner message |
| `apps/installer/src/lib/queryKeys.ts` | Create | Central key factory |
| `apps/installer/src/hooks/__tests__/*.test.ts` | Create | ≥8 Vitest tests (see Testing Strategy) |
| `apps/installer/src/components/ui/*` | Create | shadcn installs: card, badge, skeleton, collapsible, textarea, sonner, separator |
| `apps/installer/src/main.tsx` | Modify | Mount `<Toaster />` (sonner) inside providers |
| `apps/installer/package.json` | Modify | Add `sonner`, `@testing-library/react`, `@testing-library/user-event`, `jsdom` |
| `apps/installer/vite.config.ts` | Modify | Add `test.environment: 'jsdom'` and `test.setupFiles` |
| `apps/installer/src/test/setup.ts` | Create | `@testing-library/jest-dom` + `cleanup` |

## Interfaces / Contracts

```ts
// hooks/useWorklist.ts
export interface WorklistAuthorization {
  id: string;
  sync_state: 'pending_install' | 'pending_removal';
  notes: string | null;
  created_at: string;
  equipment: {
    id: string;
    description: string;
    building: {
      id: string;
      name: string;
      administration: { id: string; company_name: string };
    };
  };
  rfid_key: {
    id: string;
    rfid_code: string;
    unit: { id: string; number: string; unit_type: string };
  };
}
export function useWorklist(): UseQueryResult<WorklistAuthorization[]>;

// hooks/useAssignedTickets.ts
export interface AssignedTicket {
  id: string;
  title: string;
  description: string | null;
  status: 'open' | 'in_progress';
  opened_at: string;
  building: { id: string; name: string; administration: { id: string; company_name: string } };
}
export function useAssignedTickets(): UseQueryResult<AssignedTicket[]>;

// routes/index.tsx merge result
export interface Building {
  building: { id: string; name: string };
  administration: { id: string; company_name: string };
  authorizations: WorklistAuthorization[]; // grouped later by EquipmentGroup
  tickets: AssignedTicket[];
}

// hooks/useMarkAuthorization.ts
type MarkPayload =
  | { authorizationId: string; kind: 'install' }
  | { authorizationId: string; kind: 'remove'; remove_reason: string | null };

// hooks/useAdvanceTicket.ts
interface ResolveInput { ticketId: string; resolution_notes: string; }
// hook internally: { status: 'resolved', resolution_notes, resolved_by_staff_id: staff.id }

// hooks/mapMutationError.ts
export function toastMutationError(err: unknown): void;
// switch on PostgrestError.code: '23514' | '42501' | fetch/network | default
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit (hooks) | `useWorklist` happy path + embed-fallback branch | Mock supabase client returning success then a PGRST error; assert both paths resolve equivalent shape |
| Unit (hooks) | `useAssignedTickets` happy path + Realtime cleanup | Assert `removeChannel` on unmount |
| Unit (hooks) | `useMarkAuthorization` install + remove payloads | Assert payload keys/values, including null `remove_reason` |
| Unit (hooks) | `useAdvanceTicket` always includes `resolved_by_staff_id` | Snapshot mutation payload; assert non-null |
| Unit (hooks) | `useAddComment` optimistic insert + rollback | Trigger `onError`, assert cache reverts |
| Unit (hooks) | `mapMutationError` mapping | Table-driven test for the 5 SQLSTATE cases → toast text |
| Unit (hooks) | `useWorklist` Realtime fallback | Simulate `CHANNEL_ERROR`; assert re-subscribe without filter |
| Unit (hooks) | `useAssignedTickets` scoped by `staff.id` | Assert query key contains staff.id |
| Integration | Deferred | Component-level RTL tests not required by spec R8; add if time permits |
| E2E | Deferred | Out of scope for this change |

Vitest env: `jsdom` (needs `@testing-library/react`, `@testing-library/user-event`, `jsdom` installed).
Mock pattern: reuse the `createMockSupabase()` factory shape from
`packages/shared/src/auth/useAuth.test.ts`.

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file
classification, or process-integration boundary. The change is
UI + typed Supabase queries only.

## Migration / Rollout

No migration required. No feature flag. Single deploy of `apps/installer`.
Rollback = `git revert` (see proposal). Realtime channels are per-mount, so
old and new versions coexist safely during a rolling deploy.

## Open Questions

- [ ] None blocking. Cross-schema embed and Realtime filter behavior are
      covered by explicit fallbacks; smoke-testing them locally happens in the
      apply phase before component work begins.
