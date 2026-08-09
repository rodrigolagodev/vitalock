# Exploration: installer-worklist

**Change**: installer-worklist
**Phase**: explore
**Date**: 2026-08-08
**Persistence**: openspec (file) + engram (`sdd/installer-worklist/explore`)

## Summary

Build the installer's daily-driver home page in `apps/installer`. Single-page
Tabs layout (Worklist | Tickets), TanStack Query hooks with Realtime
subscriptions, pessimistic mutations for state transitions, optimistic for
comment inserts. All infrastructure (auth, TanStack Query, supabase client)
already wired from prior changes.

## Current state

- `apps/installer` is a Vite+React 18+TS PWA with `AuthProvider` + `ProtectedRoute` gating `/`.
- `useAuthContext()` exposes `staff.id`, `staff.role`, etc.
- TanStack Query mounted at root.
- Current `/` route is a placeholder h1 + Button.
- Only shadcn primitive installed: `Button`.
- DB fully complete: `operations.key_authorizations`, `support.tickets`, `support.ticket_comments`.
- `database.types.ts` includes all needed schemas.

## Findings per question

### Q1 — Worklist data shape

Single PostgREST query with nested embeds:

```typescript
supabase
  .schema('operations')
  .from('key_authorizations')
  .select(`
    id, sync_state, notes, created_at,
    equipment:equipment_id (
      id, description, serial_number, access_type, status,
      building:building_id (
        id, name, address,
        administration:administration_id (id, company_name)
      )
    ),
    rfid_key:rfid_key_id (
      id, rfid_code, notes,
      unit:unit_id (id, number, unit_type)
    )
  `)
  .in('sync_state', ['pending_install', 'pending_removal'])
  .order('created_at', { ascending: true })
```

Group client-side with `useMemo`: `building.id` → `equipment.id` → authorizations. Partial index on `sync_state IN ('pending_install','pending_removal')` makes this efficient.

### Q2 — Real-time updates

FLOWS.md §3.3 documents the Realtime pattern for installer worklist:

```js
supabase.channel('installer-worklist')
  .on('postgres_changes', {
    event: '*',
    schema: 'operations',
    table: 'key_authorizations',
    filter: 'sync_state=in.(pending_install,pending_removal)',
  }, () => queryClient.invalidateQueries({ queryKey: ['worklist'] }))
  .subscribe();
```

RLS applies to Realtime — installer only receives rows they can see. **Include in v1**.

### Q3 — Actions UI patterns

Two-step inline confirm. First tap → button changes to "Confirmar" state. Second tap fires mutation. No Dialog/Sheet.

For `pending_removal`: optional `remove_reason` inline expand between the two taps.

Payloads:
- `installed`: `{ sync_state: 'installed', installed_by_staff_id: staff.id }` (`installed_at` auto-trigger)
- `removed`: `{ sync_state: 'removed', removed_by_staff_id: staff.id, remove_reason: value || null }` (`removed_at` auto-trigger)

### Q4 — Tabs vs separate routes

**Tabs** (Worklist | Tickets), default Worklist. Mobile-first favors tab switching over route pushes. shadcn `Tabs` component.

### Q5 — Ticket comment UX

Chronological timeline (oldest first). Per comment: `author.full_name`, relative timestamp, body. New comment: inline textarea + Submit below timeline. Optimistic insert with `pending` visual state.

Staff names via embed: `author:author_staff_id(id, full_name)`.

### Q6 — Ticket resolution

DB enforces `resolution_notes` required for `resolved` (SQLSTATE 23514). `resolved_at` auto-trigger. `resolved_by_staff_id` app-set.

"Resolver" button → inline expand with required textarea → "Confirmar resolución" sends:
```typescript
{ status: 'resolved', resolution_notes: value, resolved_by_staff_id: staff.id }
```

Zod: `resolution_notes: z.string().min(1, 'Escribí una nota de resolución.')`.

### Q7 — Assignee race condition

Two defenses:
1. Realtime on `support.tickets` filtered by `assigned_to_staff_id=eq.{staff.id}` → invalidateQueries on change.
2. RLS returns `42501` if reassigned → catch, show "Este ticket fue reasignado. Ya no tenés acceso." + remove from local list.

### Q8 — Optimistic vs pessimistic

- **Pessimistic** for state transitions (mark installed/removed, advance ticket). Per-row spinner; wait for DB confirm before removing from UI.
- **Optimistic** for comment inserts (low stakes, append-only, easy rollback).

### Q9 — Error handling (Spanish messages)

| SQLSTATE | Cause | Message |
|----------|-------|---------|
| 23514 (status transition) | Already changed | "El estado ya fue actualizado. Actualizá la lista." |
| 23514 (resolution_notes) | Missing note | "Agregá una nota de resolución antes de cerrar el ticket." |
| 42501 | RLS denial | "No tenés permiso. Es posible que el ticket haya sido reasignado." |
| Network/timeout | Connectivity | "Error de conexión. Intentá de nuevo." |
| Generic | Unhandled | "Ocurrió un error. Código: {sqlstate}" |

Delivery: shadcn Sonner toast.

### Q10 — Empty states

- Worklist empty: "No tenés autorizaciones pendientes."
- Tickets empty: "No tenés tickets asignados."
- Both empty: "Estás al día. No tenés tareas pendientes." (on Worklist tab)

### Q11 — Loading states

Skeleton loaders (3-4 cards) on initial load. Background refetch: keep content visible + subtle header indicator. shadcn `Skeleton` + `isLoading` vs `isFetching`.

### Q12 — Offline

`vite-plugin-pwa` configured but no offline strategy. **Defer to separate change**. For this: detect `navigator.onLine === false` at mount, show banner "Sin conexión. Los datos pueden estar desactualizados."

### Q13 — Search / filter

**Defer**. Building-level grouping is enough for MVP. Flag as follow-up when >20 items.

### Q14 — shadcn components needed

```bash
pnpm dlx shadcn@latest add card badge skeleton tabs textarea sonner separator
```

## Approaches

| Approach | Description | Effort |
|---|---|---|
| **A** (recommended) | Tabs + Realtime + pessimistic mutations + Sonner | Medium |
| B | Same but no Realtime, manual refresh | Low |
| C | Separate routes `/` (worklist) + `/tickets` | Medium |

**Recommendation: A** — matches FLOWS.md domain intent (§3.3), handles field scenarios, Realtime complexity isolated to two useEffect hooks.

## Risks

1. **PostgREST cross-schema embed** (`operations` → `public`): needs smoke test with `supabase start`.
2. **Realtime `in.()` filter syntax**: verify against Supabase Realtime v2 grammar.
3. **`identity.staff` embed in ticket comments** (cross-schema): if PostgREST can't resolve, fall back to separate staff lookup.
4. **`resolved_by_staff_id` no trigger safety net**: app must always include it.
5. **10s statement timeout**: mitigated by partial index; verify in local testing.

## Ready for propose

**Safe to lock in**:
- Single page with Tabs (Worklist | Tickets)
- PostgREST nested embed query
- TanStack Query hooks + Realtime invalidateQueries
- Pessimistic state transitions; optimistic comment inserts
- Two-step inline confirm for actions
- Required textarea on ticket resolve
- Error catalog per FLOWS.md §13
- Empty + loading states
- shadcn: card, badge, skeleton, tabs, textarea, sonner, separator

**Needs user input**:
1. Realtime in v1 or defer? Recommend: **v1**.
2. `remove_reason` for pending_removal: always optional inline textarea, or skip in MVP? Recommend: **optional inline**.
3. Resolve action UI: inline expand vs Dialog? Recommend: **inline expand**.

## Key Learnings

1. Partial index on `sync_state IN (...)` makes worklist query efficient at any scale; grouping is always client-side, never DB GROUP BY.
2. FLOWS.md §3.3 documents Realtime as first-class design intent for installer, not optional.
3. `resolved_by_staff_id` has no auto-fill trigger — unlike `resolved_at`, the app must always set it.
4. Installer app already has react-hook-form + zod + TanStack Query wired from previous changes.
5. PostgREST cross-schema FK embeds work when both schemas are in `api.schemas` config — Vitalock has all 5 exposed.
