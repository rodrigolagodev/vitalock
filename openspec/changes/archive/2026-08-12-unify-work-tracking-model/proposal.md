# Proposal: Unify Work Tracking Model

## Intent

Today, "installer physically loads a key on a reader" is tracked in two systems: `operations.key_authorizations` (domain-precise) and `support.tickets.category = 'key_installation'` (generic worklist). The ticket path is created unassigned, invisible to installers under RLS, never synced to authorization state, yet gates `orders → ready_for_pickup`. Result: ghost tasks, admin manual triage, orders stuck. Physical work must map 1:1 to what admin and the order lifecycle believe. Making `key_authorizations` the sole source removes the divergence at the root.

## Scope

### In Scope

- Drop `key_installation` from `support.tickets.category` CHECK constraint.
- Modify `support.tickets_resolution_chain` — remove the `key_configuration → key_installation` branch. Trigger remains for future categories.
- Rewrite `public.recompute_order_status` keys branch to derive readiness from `key_authorizations.sync_state` via `order_items.produced_key_id → rfid_keys.id → key_authorizations.rfid_key_id`. Only `pending_install` blocks; `pending_removal` is unrelated.
- Data migration: soft-cancel existing open `key_installation` tickets (preserve audit trail) instead of hard delete.
- Verify `configure_key_order_item` RPC still commits cleanly with the chain branch removed (it must still resolve the `key_configuration` ticket; simply no follow-up ticket is spawned).

### Out of Scope

- Any change to `key_authorizations.sync_state` state machine.
- Any change to installer UI (`AuthorizationsSection`, `TicketsSection`, `BuildingWorkCard`).
- Any change to admin `useTareas` / `useTarea` hooks or UI.
- Multi-installer scoping of `key_authorizations` RLS.
- Auto-assignment of any tickets.
- Removal of the `tickets_resolution_chain` trigger itself.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `order-lifecycle`: `recompute_order_status` derives keys-branch readiness from `key_authorizations` instead of `key_installation` tickets.
- `work-tracking`: `key_installation` ticket category is removed; `key_authorizations` is the sole record of installer physical work.

## Approach

After configuration, `configure_key_order_item` creates `key_authorizations` rows in `pending_install` and resolves the `key_configuration` ticket. No `key_installation` ticket is spawned. The installer, using the existing `AuthorizationsSection`, flips each authorization to `installed`. On every authorization update, `recompute_order_status` traverses `order_items → rfid_keys → key_authorizations` for the order; if every `key`-type item has all its authorizations in `installed` (and other item types pass their own gates), the order promotes to `ready_for_pickup`. `pending_removal` authorizations belong to other orders/lifecycles and never block the current order.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `supabase/migrations/*_support_tickets.sql` (new migration) | Modified | Drop `key_installation` from category CHECK |
| `supabase/migrations/*_ticket_chain_and_stock_resolution.sql` (new migration) | Modified | Remove `key_configuration → key_installation` branch in `tickets_resolution_chain` |
| `supabase/migrations/*_keys_ready_for_pickup_requires_installation.sql` (new migration) | Modified | Rewrite `recompute_order_status` keys branch to query `key_authorizations` |
| Data migration (new) | New | Soft-cancel existing open `key_installation` tickets |
| `apps/installer/src/**` | None | No code change |
| `apps/admin/src/**` | None | Rows disappear; hooks unchanged |

## Migration and Data Plan

Order of operations in a single migration file (transactional):

1. Rewrite `public.recompute_order_status` to use the `key_authorizations` join. Deploy first so the new gate is live before ticket removal.
2. Modify `support.tickets_resolution_chain` to drop the `key_configuration` branch. No new `key_installation` tickets are generated from this point.
3. Soft-cancel every existing open `key_installation` ticket (status `cancelled`, note `superseded by key_authorizations model`). Preferred over hard delete: preserves history; app is not in production so migration risk is manageable but cheap traceability is worth keeping.
4. Drop `key_installation` from the `support.tickets.category` CHECK constraint.
5. Backfill: run `recompute_order_status` for every order currently in `in_progress` whose keys' authorizations are all `installed`. This promotes orders that were stuck behind ghost tickets.

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `recompute_order_status` rewrite handles `produced_key_id IS NULL` wrong (promotes prematurely) | Medium | Explicit NULL handling: unconfigured `key` items count as unresolved; SQL smoke test covering this case |
| `pending_removal` authorizations confused with pending installation | Medium | Filter strictly on `sync_state = 'pending_install'`; SQL smoke test asserting a `pending_removal` on another key does not block current order |
| Backfill promotes an order whose non-key items are not ready | Low | Backfill goes through full `recompute_order_status`, not a shortcut; all branches evaluated together |
| `tickets_resolution_chain` regresses future categories | Low | Removal is branch-only, not trigger drop; add regression test spawning a non-key follow-up |
| Admin loses a KPI on `key_installation` ticket volume | Low | Replaceable by a report on `key_authorizations` state per building/order; deferred as follow-up |
| Multi-installer RLS on `key_authorizations` remains coarse | Low | Out of scope; latent concern documented as follow-up |

## Rollback Plan

Because everything ships as SQL migrations against a single production-less environment:

1. Restore prior `recompute_order_status` definition from git.
2. Restore prior `tickets_resolution_chain` definition.
3. Re-add `key_installation` to the `support.tickets.category` CHECK.
4. Re-open soft-cancelled `key_installation` tickets by reverting their status via a targeted UPDATE (cancelled rows remain intact — soft cancel was chosen precisely to enable this).
5. Re-run `recompute_order_status` for affected orders.

## Dependencies

- Requires the fixes already landed in migrations 000058 (`resolve_ticket` RPC) and 000059 (dropping overload ambiguity). Both are present on `main`.

## Non-Goals / Follow-ups

- Consider removing `TicketsSection` from the installer UI if non-key tickets remain rare in practice (post-observation).
- Consider scoping `key_authorizations` RLS by installer when a second installer joins.
- Consider a lightweight admin report on `key_authorizations` state per building/order if KPI parity is requested.

## Success Criteria

- [ ] Zero `key_installation` tickets exist after migration (all soft-cancelled or none created).
- [ ] Configuring a key via `configure_key_order_item` does NOT create a `support.tickets` row.
- [ ] Installer marking a `key_authorization` as `installed` is the sole trigger that can drive an order to `ready_for_pickup`, once all its keys' authorizations are `installed`.
- [ ] `recompute_order_status` treats `produced_key_id IS NULL` as unresolved (order stays `in_progress`).
- [ ] `pending_removal` authorizations for other keys do NOT block readiness of the current order.
- [ ] Existing SQL smoke tests still pass; new coverage exists for the recompute rewrite (NULL produced_key, pending_removal isolation, mixed-item orders).
- [ ] `tickets_resolution_chain` still fires and behaves correctly for any non-`key_configuration` category.
