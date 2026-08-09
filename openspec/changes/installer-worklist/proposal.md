# Proposal: installer-worklist

**Change**: installer-worklist
**Phase**: proposal
**Date**: 2026-08-08
**Status**: approved — product decisions locked in

---

## Intent

The installer app currently shows only a placeholder page after login. Field
technicians (installers like Bruno) have no native UI to see which RFID key
authorizations need to be physically installed or removed, nor which support
tickets are assigned to them. Each shift they must rely on out-of-band
communication (phone calls, paper lists) because the app does not surface their
actual workload.

This change builds the installer's daily-driver home page: a unified per-building
work view where each building the installer must visit is a card containing two
collapsible sub-sections — one for pending key authorizations (load/remove
individual RFID cards) and one for assigned tickets (maintenance / installation
jobs). This mirrors the installer's mental model ("what do I do when I go to
Torre Callao today?") instead of splitting work by data-model concept.

Success means a logged-in installer sees, acts on, and completes their entire
shift workload from a single screen — organized by the physical route they need
to take — without any coordination overhead. The screen stays current even
when an administrator adds or changes work mid-shift.

---

## Scope

### In scope

- Replace the placeholder `apps/installer/src/routes/index.tsx` with a fully
  functional `HomePage` component that renders a **per-building work list**.
  Each building the installer must visit becomes one `BuildingWorkCard`, with
  two collapsible sub-sections inside (both can be open simultaneously; both
  default to expanded).

- **`BuildingWorkCard` header**: building name + administration name badge +
  summary counts ("3 llaves / 1 ticket") so the installer scans quickly.

- **Sub-section "Llaves"** (collapsible, default expanded): all
  `pending_install` and `pending_removal` authorizations for this building,
  sub-grouped by equipment. Each row shows the RFID key, unit, and a two-step
  inline action button (mark installed / mark removed). For `pending_removal`
  rows, an optional `remove_reason` textarea appears between the first and
  second tap. Actions are pessimistic: per-row spinner while DB confirms; row
  disappears only after successful response or Realtime invalidation.

- **Sub-section "Trabajos"** (collapsible, default expanded): all `open` and
  `in_progress` tickets assigned to the installer AT this building. Each
  ticket card shows title, status badge, description, and (expandable) an
  inline comment timeline (chronological, oldest first). Inline add-comment
  form below the timeline with optimistic insert. A "Resolver" inline expand
  reveals a required `resolution_notes` textarea; on submit the app sends
  `status: resolved`, `resolution_notes`, and `resolved_by_staff_id = staff.id`.

- **Building ordering**: buildings sorted alphabetically by name. Within each
  building, authorizations sub-grouped by equipment (equipment sorted by
  `description`), and tickets sorted by status then `opened_at`.

- **Cross-building tickets**: a ticket with `building_id` but no per-equipment
  work still lives inside its building's card. A ticket without any pending
  authorizations in its building STILL shows the building card (with only the
  Trabajos section populated and Llaves section empty/hidden).

- **Realtime** (enabled in v1): two `supabase.channel` subscriptions — one on
  `operations.key_authorizations` filtered by `sync_state=in.(pending_install,
  pending_removal)`, one on `support.tickets` filtered by
  `assigned_to_staff_id=eq.{staff.id}` — each calling `invalidateQueries` on
  any event. New work from either source triggers a UI update within ~2 s.

- **Data layer**: six TanStack Query hooks —
  `useWorklist`, `useAssignedTickets`, `useTicketComments`,
  `useMarkAuthorization`, `useAdvanceTicket`, `useAddComment` — plus one shared
  `useOnlineStatus` used by the connectivity banner. `HomePage` combines
  `useWorklist` and `useAssignedTickets` output client-side (via `useMemo`)
  into a `Building[]` shape where each building has `{ authorizations, tickets }`.

- **UI components**:
  - `components/work/BuildingWorkCard.tsx` — one per building
  - `components/work/AuthorizationsSection.tsx` — collapsible section with equipment sub-groups
  - `components/work/EquipmentGroup.tsx` — sub-group inside AuthorizationsSection
  - `components/work/AuthorizationRow.tsx` — row with two-step confirm
  - `components/work/TicketsSection.tsx` — collapsible section with ticket cards
  - `components/work/TicketCard.tsx` — expandable ticket with description + comments + actions
  - `components/work/TicketCommentsList.tsx`
  - `components/work/AddCommentForm.tsx`
  - `components/work/ResolveTicketForm.tsx`
  - `components/common/EmptyState.tsx`
  - `components/common/ConnectivityBanner.tsx`

- **shadcn component installs**: `card`, `badge`, `skeleton`, `collapsible`,
  `textarea`, `sonner`, `separator` — installed via
  `pnpm dlx shadcn@latest add card badge skeleton collapsible textarea sonner separator`
  in `apps/installer/`. (Dropped `tabs`; added `collapsible` for the two
  sub-sections inside each building card.)

- **Error handling**: five mapped error cases from FLOWS.md §13, delivered as
  Sonner toasts. Spanish-language messages.

- **Empty state**: when no building has any pending work,
  render "Estás al día. No tenés tareas pendientes." with a positive icon
  (no per-section empty states — collapsible sub-sections just hide when empty).

- **Loading states**: shadcn `Skeleton` placeholders on initial load (3–4 card
  shapes); subtle header indicator on background refetch (`isFetching`).

- **Connectivity banner**: shown when `navigator.onLine === false` at mount.

- **Vitest tests**: minimum 8 tests covering happy paths and error paths for the
  six hooks, using a mocked Supabase client.

- **Types**: reuse from `packages/supabase/src/database.types.ts`; local view
  types for nested query shapes where needed.

### Out of scope for v1

- Offline caching / service worker strategies (PWA plugin is present but
  configuring meaningful offline support for a dynamic worklist is a separate
  concern).
- Search and filter UI (building-level grouping is sufficient for MVP; add when
  worklist exceeds ~20 items).
- Push notifications and sound alerts.
- Admin-side worklist or ticket views.
- History view of completed authorizations.
- Installer-visible ticket creation.

---

## Approach

The home page is replaced with a single `HomePage` component that renders a
list of `BuildingWorkCard` — one per building where the installer has any
pending work. Each card contains two collapsible sub-sections: **Llaves** (the
pending authorizations for that building, sub-grouped by equipment) and
**Trabajos** (the tickets assigned to the installer for that building). Both
sub-sections default to expanded; the installer can collapse either to focus.
This organization matches the installer's mental model — "when I go to Torre
Callao today, what do I do there?" — instead of splitting the same physical
visit into two separate app screens.

Two TanStack Query hooks (`useWorklist`, `useAssignedTickets`) fetch the
underlying data. `HomePage` combines them via `useMemo` into a
`Building[]` shape. The worklist query is a single PostgREST nested embed on
`operations.key_authorizations`, returning the authorization together with its
equipment, building, administration, RFID key, and unit in one round-trip.
Grouping (by building, then within a building by equipment) is client-side —
no DB `GROUP BY`. The existing partial index on `sync_state` keeps the query
well inside the 10 s statement timeout at any realistic scale.

State transitions use pessimistic mutations throughout. When a field technician
marks an authorization as installed, a per-row spinner blocks further interaction
until the database confirms the change. Only after confirmation does the row
leave the UI — either via the Realtime invalidation or the mutation's `onSuccess`
callback. This avoids rollback complexity in environments where mobile network
can drop mid-request. The only exception is comment inserts, which are optimistic
(append-only, low-stakes): the comment appears immediately with a pending visual
indicator and is replaced by the confirmed DB row or rolled back on error. All
destructive or irreversible actions (mark installed, mark removed, resolve ticket)
use a two-step inline confirm pattern: the first tap changes the button to a
"Confirmar" state; the second tap fires the mutation. No modal dialogs are used,
keeping the flow fast on a small touchscreen.

Realtime is included in v1 because FLOWS.md §3.3 documents it as first-class
design intent for the installer, and the field scenario demands it: an
administrator in the office may add urgent authorizations mid-shift. Each hook
sets up a `supabase.channel` subscription in a `useEffect` and tears it down in
the cleanup function. Invalidation is cheap (one re-query) and correct. The
Realtime filter on `sync_state=in.(pending_install,pending_removal)` means the
installer also receives an implicit delete event when they mark a row installed —
the row leaves the filter and the subscription fires, driving the UI update
without extra logic. Error handling across all mutations follows the five-case
SQLSTATE catalog defined in FLOWS.md §13, surfaced via Sonner toasts in Spanish.

---

## Affected areas

| Area | Path | Change |
|------|------|--------|
| Installer home route | `apps/installer/src/routes/index.tsx` | Full replacement — placeholder becomes `HomePage` |
| Work components | `apps/installer/src/components/work/` | New directory and 9 components (BuildingWorkCard, AuthorizationsSection, EquipmentGroup, AuthorizationRow, TicketsSection, TicketCard, TicketCommentsList, AddCommentForm, ResolveTicketForm) |
| Common components | `apps/installer/src/components/common/` | New directory: `EmptyState`, `ConnectivityBanner` |
| Data hooks | `apps/installer/src/hooks/` | 6 new hooks (`useWorklist`, `useAssignedTickets`, `useTicketComments`, `useMarkAuthorization`, `useAdvanceTicket`, `useAddComment`) |
| shadcn UI primitives | `apps/installer/src/components/ui/` | 7 new primitives added by `pnpm dlx shadcn@latest add` |
| Supabase types | `packages/supabase/src/database.types.ts` | Read-only; local view types added alongside hooks where needed |
| Auth context | `packages/shared/src/auth/` | Read-only; `staff.id` consumed for `installed_by_staff_id` / `resolved_by_staff_id` |
| Vitest tests | `apps/installer/src/hooks/__tests__/` | New — minimum 8 tests |

No database migrations. No changes to RLS policies. No changes to shared
packages beyond reading existing exports.

---

## Dependencies

- **DB + RLS**: `operations.key_authorizations`, `support.tickets`,
  `support.ticket_comments`, `identity.staff` are fully built and RLS-enforced.
  No schema changes required.
- **Auth layer**: `AuthProvider` + `useAuthContext()` expose `staff.id` and
  `staff.role`. Already wired in `apps/installer`.
- **TanStack Query**: QueryClient mounted at root in `apps/installer/src/main.tsx`.
  Already wired.
- **Supabase client**: typed client exported from `packages/supabase`. Already
  imported in the app.
- **react-hook-form + zod**: already installed in `apps/installer`; used for
  `resolution_notes` validation.
- **vite-plugin-pwa**: already in dev dependencies; this change does not touch it.

---

## Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| PostgREST cross-schema embed depth (`operations → public → public`) fails or returns unexpected nulls | Low | High | Smoke-test query with `supabase start` before writing components; fall back to a separate query for building/administration if needed |
| Realtime `in.()` filter syntax not supported in local Supabase Realtime v2 build | Low | Medium | Verify filter locally; fall back to subscribing without a filter and invalidating all worklist queries on any event |
| `identity.staff` embed from `support.ticket_comments` fails cross-schema | Medium | Low | Fall back to fetching a `{ id → full_name }` lookup map separately; comment UI degrades gracefully to staff ID |
| `resolved_by_staff_id` omitted on resolve → silent null in DB | Low | Medium | Hook always reads `staff.id` from `useAuthContext()` and includes it; covered by a Vitest test |
| Realtime subscription leaks on unmount (hook missing cleanup) | Low | Medium | Each `useEffect` returns `() => supabase.removeChannel(channel)` |
| Mobile network drop mid-mutation causes false-positive removal | N/A | — | Pessimistic mutations prevent this by design; row stays until DB confirms |

---

## Rollback plan

All changes are confined to `apps/installer/src/`. No database migrations are
included. Rollback is a single `git revert` of the change commit. The DB schema,
RLS policies, and all other app packages remain untouched and functional after
revert. The installer app reverts to its placeholder home page, which was the
prior state before this change.

---

## Success criteria

1. Bruno logs in → sees one `BuildingWorkCard` per building where he has any
   pending work. Each card header shows counts ("3 llaves / 1 ticket").
2. Within a card, "Llaves" section shows pending authorizations sub-grouped by
   equipment. "Trabajos" section shows assigned tickets for that same building.
   Both sections default to expanded; either can be collapsed.
3. Bruno taps "Cargar" on a `pending_install` auth → button changes to
   "Confirmar" → second tap → DB updates to `installed`, row disappears via
   Realtime invalidation, Sonner toast confirms. When the last authorization
   in a building's Llaves section clears, the section hides.
4. Bruno taps "Borrar" on a `pending_removal` auth → optional reason textarea
   appears → second tap → DB updates to `removed`, row disappears, toast
   confirms.
5. Bruno taps a ticket card → expands to reveal description and chronological
   comment timeline.
6. Bruno adds a comment → appears immediately with a pending indicator
   (optimistic), then confirmed; reverts visually on network error.
7. Bruno resolves a ticket → inline `resolution_notes` textarea appears →
   submit → `resolved_by_staff_id` is set → ticket disappears from the section,
   toast confirms.
8. Admin adds a new authorization for Bruno in another session → Bruno's UI
   shows the new row within ~2 s (Realtime). If the authorization is for a
   building that had no pending work before, a new `BuildingWorkCard` appears.
9. Admin reassigns a ticket away from Bruno → ticket disappears from the
   corresponding building's Trabajos section within ~2 s. If that ticket was
   the only work in that building, the whole card disappears.
10. Bruno's device goes offline → connectivity banner appears immediately.
11. When Bruno has no pending work anywhere → renders the empty state "Estás al
    día. No tenés tareas pendientes."
12. Vitest: ≥ 8 hook tests pass covering happy paths and the five error cases.
13. Pipeline green: install / build / typecheck / lint / test all pass.

---

## Key Learnings

1. The partial index on `sync_state IN ('pending_install', 'pending_removal')`
   makes the worklist query efficient at any scale. Grouping is always
   client-side via `useMemo`, never a DB `GROUP BY`.
2. FLOWS.md §3.3 documents Realtime as first-class design intent for the
   installer, not an optional enhancement. It belongs in v1.
3. `resolved_by_staff_id` has no auto-fill trigger — unlike `resolved_at`, the
   app must always include it in the resolve payload. No DB constraint enforces
   this; the hook and a test must own it.
4. The installer app already has react-hook-form, zod, TanStack Query, and the
   Supabase typed client wired from previous changes. This change is purely
   additive at the UI and hooks layer.
5. PostgREST cross-schema FK embeds work when all schemas are listed in
   `api.schemas` in `config.toml`. Vitalock exposes all five schemas (`public`,
   `operations`, `support`, `identity`, `finance`), so the nested embed query
   is valid — but it must be smoke-tested locally before relying on it.
6. Pessimistic mutations are the correct default for irreversible field
   operations. Optimistic updates are appropriate only for append-only,
   easily-rolled-back operations like comment inserts.
