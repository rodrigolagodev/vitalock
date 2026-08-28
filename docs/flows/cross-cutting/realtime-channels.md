---
name: realtime-channels
title: Realtime Subscriptions & Cache Invalidation
kind: cross-cutting
actors: [admin, installer, system]
covers_requirements:
  - realtime#assigned-tickets-channel
  - realtime#filter-fallback
related_rpcs: []
related_tables:
  - support.tickets
  - support.equipment_updates
covering_tests:
  vitest:
    - apps/installer/src/hooks/__tests__/useAssignedTickets.test.ts
last_verified: 2026-08-27
---

# Realtime Subscriptions & Cache Invalidation

## Purpose

Vitalock uses Supabase Realtime for the **installer app** to receive
ticket updates without polling. The admin app is currently poll-based
via TanStack Query intervals (or manual invalidation after
mutations). Only one live subscription is documented today: the
installer's assigned tickets.

## The assigned-tickets channel

Defined in `apps/installer/src/hooks/useAssignedTickets.ts:235-274`.

### Subscription setup

```typescript
let channel = supabase
  .channel(`assigned-tickets-${staffId}`)
  .on(
    'postgres_changes',
    {
      event: '*',
      schema: 'support',
      table: 'tickets',
      filter: `assigned_to_staff_id=eq.${staffId}`,
    },
    () => {
      void queryClient.invalidateQueries({ queryKey: assignedTicketsKey(staffId) });
    },
  );

channel.subscribe((status, err) => {
  if (status === 'CHANNEL_ERROR') {
    log.warn('Realtime filter rejected, re-subscribing filterless.', err);
    void supabase.removeChannel(channel);
    channel = supabase
      .channel(`assigned-tickets-filterless-${staffId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'support', table: 'tickets' },
        () => {
          void queryClient.invalidateQueries({ queryKey: assignedTicketsKey(staffId) });
        },
      )
      .subscribe();
  }
});
```

Two-layer design:

1. **Preferred**: subscribe with a server-side filter
   (`assigned_to_staff_id=eq.<id>`) so only relevant changes reach
   the client.
2. **Fallback**: if the filter is rejected (some deployments reject
   `filter=` due to RLS policy shape), re-subscribe **without** a
   filter and rely on the RLS row-level scoping to keep the payload
   safe. The client's TanStack Query WHERE clause additionally
   filters what actually gets displayed.

The fallback exists because early Realtime deployments had known
issues with filter+RLS interaction; the code opts for graceful
degradation over a hard failure.

### What triggers invalidation

Every `postgres_changes` event on `support.tickets` (insert, update,
delete) fires the callback, which invalidates
`assignedTicketsKey(staffId)`. TanStack Query then refetches via
`fetchAssignedTickets`.

Note: **the payload from Realtime is IGNORED** — the invalidation
strategy always re-queries the server. This is because
`fetchAssignedTickets` joins many tables (buildings, administrations,
`equipment_updates`, products) and reconstructing them from a single
Realtime event is not worth the complexity.

## Admin app — no Realtime today

The admin app uses:

1. **Manual invalidation** on mutations
   (`queryClient.invalidateQueries({ queryKey: ... })` in every
   `useMutate*` hook).
2. **Query key hierarchies** in `apps/admin/src/lib/queryKeys.ts`
   for granular invalidation.
3. **No polling intervals** in most queries (default TanStack
   settings).

If two admins are editing simultaneously, they will not see each
other's changes until one of them navigates or refetches. This is
acceptable for the current single-tenant, low-concurrency ops model.

## Storage bucket downloads

The `equipment_updates` MDB files are fetched on-demand from the
storage bucket. There is no Realtime subscription on storage events —
the ticket carrying `mdb_storage_path` is the only signal that a new
file is available. The installer's ticket subscription indirectly
covers this.

## Cross-cutting effects

- **RLS + filter layering**: even with `filter=` in the subscription,
  RLS scopes what the client sees. Removing the filter (fallback)
  does not create a leak.
- **Fresh session on channel error**: the code recreates the channel
  from scratch on `CHANNEL_ERROR`, avoiding zombie subscriptions.
- **Cleanup on unmount** (line 273): `useEffect` returns
  `() => supabase.removeChannel(channel)` — critical to avoid channel
  leaks across route changes.

## Error paths & guards

| Trigger | Guard | Effect |
|---|---|---|
| Server rejects filtered subscribe | `status === 'CHANNEL_ERROR'` branch | Re-subscribes filterless |
| Channel disconnects | Supabase client auto-reconnects; TanStack refetches on window focus | Recovered on next event or focus |
| No staff id (unauthenticated) | `if (!staffId) return` guard | Subscription never created |
| Duplicate subscribe on re-render | `useEffect` cleanup + fresh channel name per mount | Prevented |

## Known gaps

1. **Only one Realtime subscription in the entire product**. Admin
   pages currently do not update in real time — if a technical order
   is confirmed by another admin, the current admin does not see it
   until refetch. Consider adding subscriptions on
   `technical_orders`, `key_orders`, and `stock_movements` if this
   becomes a UX problem.
2. **Fallback is silent** — when the filtered subscribe is rejected,
   a `log.warn` is emitted but the operator sees no UI indicator.
   If Realtime is misconfigured in a specific environment (e.g.
   staging), the app will silently switch to broader subscriptions.
   Consider adding a diagnostic marker in the UI in dev mode.
3. **`storage.objects` has no Realtime**. If a large MDB upload
   completes AFTER the installer opens the ticket, they must refresh
   the ticket to see the download link enabled.

## QA checklist

- [ ] Login as installer on device A. Login as admin on device B.
      Admin creates a new ticket assigned to the installer. Verify
      installer's device A shows the new ticket within ~1s of
      creation.
- [ ] Same setup: admin resolves the ticket from admin's side.
      Verify installer's list refetches automatically.
- [ ] Simulate Realtime failure (e.g. via DevTools network throttle
      or misconfigure). Verify the filterless fallback path
      triggers and works.
- [ ] Navigate away from installer home. Verify the channel is
      removed (no zombie subscriptions in
      `supabase.getChannels()`).

## Related flows

- [[rls-boundaries]] — how the filter and RLS layer together.
- [[technical-order-lifecycle]] — the primary source of new
  ticket-assigned events.
- All ticket-type journeys — the installer is the consumer.
