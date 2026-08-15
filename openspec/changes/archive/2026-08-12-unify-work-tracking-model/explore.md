# Exploration: Unify Work Tracking Model

**Status**: done
**Next Recommended**: sdd-propose

## Executive Summary

Two systems track the same event ("installer physically loads an RFID key onto a reader"). The `key_installation` ticket category is the redundant layer — unassigned on creation (RLS blocker), never synced with the domain state in `key_authorizations`, and blocking order lifecycle. Recommendation: **Option 1 — kill `key_installation` tickets and rewrite `recompute_order_status` to derive readiness from `key_authorizations` state directly.**

## Current State

**System 1 — `operations.key_authorizations`** (domain-specific)

One row per `(rfid_key_id, equipment_id)`. State: `pending_install → installed` / `pending_install → removed` / `installed → pending_removal → removed`. Created by `configure_key_order_item` RPC. RLS lets any installer SELECT + UPDATE all rows.

**System 2 — `support.tickets` category `key_installation`** (generic worklist)

One row per order_item. Auto-created by `tickets_resolution_chain` trigger when the `key_configuration` ticket resolves. Created with `assigned_to_staff_id = NULL` — the RLS policy (`installer_read_own_tickets`: `assigned_to_staff_id = current_staff_id()`) blocks installer visibility. Order lifecycle gates readiness here: `recompute_order_status` requires `v_unresolved_install = 0` before promoting to `ready_for_pickup`.

**The gap in practice:**
- Installer marks authorization `installed` (System 1) → `key_installation` ticket stays `open` forever (System 2 never told).
- Tickets created unassigned → installer RLS blocks visibility → admin must manually assign each ticket for the installer to see it.
- Order lifecycle depends on ticket resolution → `ready_for_pickup` never fires unless admin intervenes.

Recent fixes (migration 000058 `resolve_ticket` RPC, migration 000059 dropping overload ambiguity) treated symptoms; the root design conflict is untouched.

## Affected Areas

**Migrations:**
- `20260806000007_operations_key_authorizations.sql` — table definition
- `20260808000014_support_tickets.sql` — ticket table
- `20260808000015_rls_real_policies.sql` — RLS policies
- `20260811000039_ticket_chain_and_stock_resolution.sql` — chain trigger
- `20260811000040_extend_configure_key_order_item_rpc.sql` — configure_key RPC
- `20260811000057_keys_ready_for_pickup_requires_installation.sql` — `recompute_order_status` keys branch + backfill

**Installer:**
- `apps/installer/src/hooks/useWorklist.ts` (queries key_authorizations)
- `apps/installer/src/hooks/useCompleteAuthorizations.ts` (mutates sync_state)
- `apps/installer/src/hooks/useAssignedTickets.ts` (queries tickets)
- `apps/installer/src/hooks/useResolveTickets.ts` (RPC caller)
- `apps/installer/src/routes/index.tsx` (merges both)
- `apps/installer/src/components/work/{BuildingWorkCard,AuthorizationsSection,TicketsSection}.tsx`

**Admin:**
- `apps/admin/src/hooks/useTareas.ts`, `useTarea.ts`

## Approaches

### Option 0 — Bidirectional sync via triggers

Trigger on `key_authorizations`: when `sync_state → installed`, resolve linked `key_installation` ticket. Auto-assign tickets to `current_staff_id` on creation.

| | |
|--|--|
| DB change | 1–2 migrations, no schema change |
| UI change | None |
| Effort | Low |
| Risk | Medium — trigger-within-trigger, wrong assignment (admin ≠ installer), ghost tickets |
| Mental model | Two systems paper-over each other; next bug is a matter of when |

### Option 1 — Kill `key_installation` tickets (Recommended)

`key_authorizations` becomes the sole source. Drop the category. Rewrite `recompute_order_status` to derive readiness from authorization state via `order_items → rfid_keys → key_authorizations`.

| | |
|--|--|
| DB change | 1–2 migrations, no structural schema change. SQL rewrite of `recompute_order_status` keys branch. Remove chain trigger branch. Data cleanup. |
| UI change | Moderate. `TicketsSection` receives zero `key_installation` tickets. Remains for non-key work. `AuthorizationsSection` unchanged. |
| Order lifecycle | Derives readiness from `key_authorizations.sync_state = 'installed'` via `order_items (item_type='key') → produced_key_id → rfid_keys → key_authorizations` |
| Admin tareas | `key_installation` rows disappear (they were ghost tasks) |
| Effort | Medium |
| Risk | Low–Medium. Recompute SQL rewrite is the highest-risk piece; must handle NULL `produced_key_id` and not confuse `pending_removal` with pending installation |
| Mental model | A job is a `key_authorization` row — domain-specific, precise, carries rfid/equipment/installer/timestamp natively |

### Option 2 — Kill `key_authorizations.sync_state`

Tickets as sole source. Installer resolves a ticket per key; trigger flips authorization to `installed`. Requires solving auto-assignment.

| | |
|--|--|
| DB change | Schema change (remove sync_state or repurpose). New trigger. Auto-assignment strategy |
| UI change | Major — remove `AuthorizationsSection`, replicate RFID/equipment context in `TicketCard` |
| Assignment problem | Unsolved blocker: unassigned tickets, RLS blocks visibility. Auto-assign to `current_staff_id` = admin (wrong). Broadcast requires RLS change |
| Granularity loss | One key can load on N readers; a ticket represents "install this key", not "load onto reader X" — wrong level of abstraction |
| Effort | High |
| Risk | High |

### Option 3 — Unified `work_items` table

Replace both with a new table + kind discriminator.

| | |
|--|--|
| Effort | Very High |
| Risk | High |
| Verdict | Over-engineered for codebase size. Functionally equivalent to Option 1 with more moving parts. Not recommended |

## Comparison

| Criterion | Opt 0 Sync | Opt 1 Kill tickets | Opt 2 Kill sync_state | Opt 3 work_items |
|---|---|---|---|---|
| Migrations | 1–2, no schema | 1–2, no schema | Medium schema | Very high |
| Installer UI | None | Moderate | Major rewrite | Major rewrite |
| Admin UI | None | Minor | Minor | Major |
| RLS | Same broken assignment | Simpler | Harder (assignment) | New policies |
| Lifecycle | Works after patch | SQL rewrite (bounded) | No change | Rewrite |
| Mental model | Dishonest dual state | Clear domain model | Generic, loses context | Clear but overkill |
| Effort | Low | Medium | High | Very High |
| Risk | Medium | Low–Medium | High | High |

## Recommendation

**Option 1.** To formalize in `sdd-propose`:

1. Modify `tickets_resolution_chain` — drop the `key_configuration` branch (leave the trigger for future categories).
2. Drop `key_installation` from `support.tickets.category` CHECK constraint.
3. Rewrite `recompute_order_status` keys branch: replace `v_unresolved_install` count with a count of `key_authorizations` where `sync_state NOT IN ('installed', 'removed')`, joined via `order_items.produced_key_id → rfid_keys.id → key_authorizations.rfid_key_id`. Only `pending_install` blocks; `pending_removal` is a separate lifecycle event.
4. Data migration: cancel or delete existing open `key_installation` tickets.
5. Admin `useTareas`: no code change; rows simply no longer exist.
6. Installer UI: `useAssignedTickets` continues serving maintenance/equipment tickets. `TicketsSection` renders empty for key-only buildings (correct). No component deletion required now; potential follow-up if non-key tickets are rare in practice.

## Risks

- `recompute_order_status` SQL rewrite is the highest-risk piece. Longer join chain. Must handle: (a) `produced_key_id IS NULL` (not yet configured — order stays `in_progress`), (b) `pending_removal` must not block current-order readiness.
- Admin's tareas view loses `key_installation` category. If anyone tracks it as a KPI, a separate report on `key_authorizations` state per building/order is needed.
- `useWorklist` currently returns ALL pending authorizations system-wide (not scoped to logged-in installer). Unchanged by Option 1 but a latent concern for multi-installer scenarios.
- `tickets_resolution_chain` may host other categories in the future. Removing only the `key_configuration` branch (not dropping the trigger) is safer.

## Ready for Proposal

Yes. Boundary is well-defined; the SQL rewrite is the main design decision for `sdd-propose`.

## Key Learnings

1. The `key_installation` ticket category was created unassigned by design, making the installer RLS policy a structural blocker from day one.
2. `recompute_order_status` gates `ready_for_pickup` on ticket resolution, not on `key_authorizations.sync_state`, creating a permanent divergence between physical work and lifecycle belief.
3. `configure_key_order_item` RPC creates authorizations and resolves the `key_configuration` ticket in one transaction, so the chain trigger spawning `key_installation` fires inside that same call.
4. `pending_removal` in `key_authorizations` is a separate lifecycle event that must not be confused with pending installation work when deriving order readiness.
5. Option 1's recompute join chain traverses `order_items.produced_key_id → rfid_keys.id → key_authorizations.rfid_key_id`, which is longer but always correct; the current ticket-based query is shorter only because it relies on an intermediary that is inherently unsynced.
