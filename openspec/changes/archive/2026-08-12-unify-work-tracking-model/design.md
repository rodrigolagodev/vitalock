# Design: Unify Work Tracking Model

## Technical Approach

Retire `key_installation` as a valid ticket category. Rewrite the keys branch of `public.recompute_order_status` so readiness derives from `operations.key_authorizations.sync_state` (traversed via `order_items.produced_key_id → rfid_keys.id → key_authorizations.rfid_key_id`) instead of open `key_installation` tickets. Prune the `key_configuration → key_installation` branch from `support.tickets_resolution_chain`. Soft-cancel every open `key_installation` ticket (audit trail preserved, FKs intact). Backfill by re-running `recompute_order_status` for every actionable keys order so orders parked behind ghost tickets promote. All DDL/DML ships in one file: `supabase/migrations/20260812000060_unify_work_tracking_model.sql`.

## Architecture Decisions

### Decision: Single migration file, ordered internally

**Choice**: One migration with five ordered steps.
**Alternatives considered**: Split across three files (function rewrite, chain trigger, CHECK+data). Rejected — three separate files would leave intermediate states in which either the CHECK still admits `key_installation` while the chain no longer produces them (harmless but noisy), or the CHECK drops `key_installation` before old rows are cancelled (would violate the constraint on a subsequent trigger-driven update to those rows).
**Rationale**: Ordering matters within a single transactional file. Postgres validates CHECK constraints at ALTER time, not per-tuple lazily, so we must drop rows before shrinking the domain.

### Decision: Soft-cancel over hard delete

**Choice**: `UPDATE support.tickets SET status='cancelled', cancellation_reason=..., cancelled_at=now()`.
**Alternatives considered**: `DELETE FROM support.tickets WHERE category='key_installation' AND status IN ('open','in_progress')`. Rejected — FK references from `stock_movements.ticket_id` and any future auditing tables would orphan or block. Admin `useOrderTareas` would silently lose history.
**Rationale**: `cancellation_reason` column already exists (see `enforce_installer_ticket_column_restrictions`). Soft-cancel keeps rows visible in admin as `cancelled` — the correct honest state — and rollback is a simple UPDATE.

### Decision: `tickets_resolution_chain` — keep trigger, empty body

**Choice**: `CREATE OR REPLACE FUNCTION support.tickets_resolution_chain()` returning early after the `status='resolved'` guard. Function body has no category branches. Trigger stays installed.
**Alternatives considered**: `DROP TRIGGER tickets_resolution_chain ON support.tickets`. Rejected — future categories (spec Requirement "Non-key_configuration resolution chain still fires for other categories") need this trigger present; recreating it later is more churn than a two-line no-op body.
**Rationale**: Trigger overhead on a resolution transition is a single function call returning null — cheaper than DROP+CREATE later.

### Decision: Backfill via full `recompute_order_status`, not a shortcut UPDATE

**Choice**: `DO $$ ... FOR v_order_id IN SELECT DISTINCT ... LOOP PERFORM public.recompute_order_status(v_order_id); END LOOP; $$`.
**Alternatives considered**: Direct `UPDATE orders SET status='ready_for_pickup' WHERE ...`. Rejected — bypasses non-key gates and cannot demote wrongly-ready orders.
**Rationale**: Mirrors migration 000057's healing pattern (STEP 4). Idempotent and safe to re-run.

## Data Flow

    configure_key_order_item RPC
              │
              ├─► resolves key_configuration ticket (no follow-up spawned)
              └─► inserts key_authorizations (sync_state='pending_install')

    Installer flips key_authorizations.sync_state → 'installed'
              │
              └─► client calls recompute_order_status(order_id)

    recompute_order_status keys branch:
        order_items (item_type='key', status<>'cancelled')
              │  produced_key_id
              ▼
        rfid_keys
              │  id
              ▼
        operations.key_authorizations (sync_state='pending_install' → blocking)

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/20260812000060_unify_work_tracking_model.sql` | Create | Five ordered steps: rewrite recompute, empty chain trigger, soft-cancel, drop CHECK entry, backfill |
| `supabase/tests-sql/test_unify_work_tracking.sql` | Create | Six edge-case scenarios per spec (BEGIN/ROLLBACK per case) |

## SQL Sketches

### Step a — Rewrite `public.recompute_order_status` (keys branch only)

```sql
create or replace function public.recompute_order_status(p_order_id uuid)
returns void language plpgsql as $$
declare
  v_current_status     text;
  v_order_type         text;
  v_total_key_items    int;
  v_configured         int;
  v_unresolved_install int;
  v_total_tickets      int;
  v_open               int;
  v_in_progress_t      int;
  v_resolved           int;
begin
  select status, order_type
    into v_current_status, v_order_type
    from public.orders where id = p_order_id for update;

  if v_current_status in ('completed','invoiced','cancelled') then return; end if;

  if v_order_type = 'keys' then
    if v_current_status not in ('confirmed','in_progress','ready_for_pickup') then return; end if;

    select
      count(*) filter (where item_type='key' and status<>'cancelled'),
      count(*) filter (where item_type='key' and status<>'cancelled' and produced_key_id is not null)
      into v_total_key_items, v_configured
    from public.order_items where order_id = p_order_id;

    if v_total_key_items = 0 then return; end if;

    -- Blocking installations = authorizations still pending_install for the
    -- order's produced keys. pending_removal belongs to other lifecycles.
    select count(*)
      into v_unresolved_install
      from operations.key_authorizations ka
     where ka.sync_state = 'pending_install'
       and ka.rfid_key_id in (
         select oi.produced_key_id
           from public.order_items oi
          where oi.order_id = p_order_id
            and oi.item_type = 'key'
            and oi.status <> 'cancelled'
            and oi.produced_key_id is not null
       );

    if v_configured > 0 and v_current_status = 'confirmed' then
      update public.orders set status='in_progress' where id = p_order_id;
      v_current_status := 'in_progress';
    end if;

    if v_configured = v_total_key_items and v_unresolved_install = 0 then
      if v_current_status <> 'ready_for_pickup' then
        update public.orders set status='ready_for_pickup' where id = p_order_id;
      end if;
    elsif v_current_status = 'ready_for_pickup'
          and (v_configured < v_total_key_items or v_unresolved_install > 0) then
      update public.orders set status='in_progress' where id = p_order_id;
    end if;

    return;
  end if;

  -- Technical flow: unchanged from migration 000057.
  if v_current_status not in ('confirmed','in_progress') then return; end if;
  select
    count(*) filter (where status<>'cancelled'),
    count(*) filter (where status='open'),
    count(*) filter (where status='in_progress'),
    count(*) filter (where status='resolved')
    into v_total_tickets, v_open, v_in_progress_t, v_resolved
    from support.tickets
   where order_item_id in (select id from public.order_items where order_id = p_order_id);
  if v_total_tickets = 0 then return; end if;
  if v_resolved = v_total_tickets then
    update public.orders set status='completed' where id = p_order_id;
  elsif v_in_progress_t > 0 or v_resolved > 0 then
    if v_current_status = 'confirmed' then
      update public.orders set status='in_progress' where id = p_order_id;
    end if;
  end if;
end;
$$;
```

Note: `v_configured` is now defined as "has a `produced_key_id`", not `status='configured'`. Explicit NULL-handling: an unconfigured item (`produced_key_id IS NULL`) leaves `v_configured < v_total_key_items` and blocks promotion. Do NOT filter on `pending_removal`.

### Step b — Prune the chain trigger

```sql
create or replace function support.tickets_resolution_chain()
returns trigger language plpgsql security definer
set search_path = support, public as $$
begin
  -- Chain trigger kept for future categories; no active branches today.
  -- key_configuration → key_installation branch removed per
  -- unify-work-tracking-model. Guard remains so future INSERTs are cheap.
  if new.status <> 'resolved' or old.status = 'resolved' then
    return null;
  end if;
  return null;
end;
$$;
```

### Step c — Soft-cancel existing rows

```sql
update support.tickets
   set status = 'cancelled',
       cancellation_reason = 'Auto-cancelled by unify-work-tracking-model migration; readiness now derived from key_authorizations',
       resolved_at = now()
 where category = 'key_installation'
   and status in ('open','in_progress');
```

(`support.tickets` has no `cancelled_at` column; `resolved_at` is the existing timestamp for terminal transitions per column list.)

### Step d — Shrink the CHECK domain

```sql
alter table support.tickets drop constraint tickets_category_check;
alter table support.tickets
  add constraint tickets_category_check check (category in (
    'maintenance', 'installation', 'key_configuration', 'equipment_installation'
  ));
```

Must run AFTER Step c so no live row violates the new constraint.

### Step e — Backfill

```sql
do $$
declare v_order_id uuid;
begin
  for v_order_id in
    select distinct oi.order_id
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
     where oi.item_type = 'key'
       and o.status in ('confirmed','in_progress','ready_for_pickup')
  loop
    perform public.recompute_order_status(v_order_id);
  end loop;
end $$;
```

## Migration Ordering Rationale

- **a before b**: The new recompute reads only `key_authorizations`, so it is safe with the old chain still installed (chain would spawn tickets recompute now ignores). Deploying recompute first means no window where the old recompute reads tickets we are about to cancel.
- **b before c**: Removing the chain branch before mass-cancelling prevents new `key_installation` inserts during the cancel window. The chain fires on `status='resolved'`, so a concurrent resolve of a `key_configuration` ticket in mid-migration would insert a fresh `key_installation` row we would then have to cancel too.
- **c before d**: The CHECK constraint validation scans all rows. Any live `key_installation` row would fail the new constraint. Cancelling doesn't remove the row but the CHECK is on `category`, not `status`, so cancelling alone is insufficient — we must also drop the value from the domain.

  **Correction**: Cancelling does NOT remove `category='key_installation'` from existing rows. Postgres validates CHECK on tuple insert/update; ALTER ADD CONSTRAINT re-validates all rows. Existing cancelled `key_installation` rows would FAIL the new constraint.

  **Resolution**: Step d must PRESERVE `key_installation` in the CHECK to allow the historical rows to remain readable. Rewrite Step d as:

  ```sql
  -- key_installation removed from the ACCEPTED domain for new rows,
  -- but kept in the CHECK to grandfather cancelled historical rows.
  -- Preventing new inserts is enforced at the trigger layer (Step b: chain
  -- no longer spawns them) and by application code (TS union type update
  -- outside this migration).
  ```

  **Chosen path**: Do NOT drop `key_installation` from the CHECK. The spec's updated requirement ("No New key_installation Tickets") is satisfied at the write-path level by:
  - (b) Removing the chain branch (no auto-spawn path).
  - **New Step b2**: BEFORE INSERT trigger `support.tickets_reject_key_installation_inserts` that raises `SQLSTATE 22023` (invalid_parameter_value) when `NEW.category = 'key_installation'`. Error message: `"key_installation is no longer a supported ticket category; see unify-work-tracking-model change (use operations.key_authorizations for install tracking)."`. This closes any other write path (direct SQL, admin UI form, tests) while leaving the CHECK permissive for the existing rows.
  - (c) Cancelling existing rows for hygiene.
  - TypeScript union update in `apps/admin/src/hooks/useTareas.ts` (removes `key_installation` from `TareaRow.category`).

  Historical soft-cancelled rows remain readable (audit preserved). A future follow-up may purge them and drop the CHECK value entirely.

- **e last**: Backfill invokes the new recompute, which needs the rewritten function (a) and the ghost tickets already gone (c) to give the correct answer.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| SQL smoke | 6 edge cases from spec: (1) all authorizations installed → promotes, (2) one `pending_install` → stays `in_progress`, (3) `pending_removal` on unrelated key does not block, (4) `produced_key_id IS NULL` blocks promotion, (5) resolving `key_configuration` spawns no follow-up, (6) demotion from `ready_for_pickup` when authorization reverts | New `supabase/tests-sql/test_unify_work_tracking.sql` using BEGIN/ROLLBACK per scenario |
| Application | None | Installer/admin UI unchanged |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. This is a DB-only change.

## Rollback (manual — no down migration per Supabase CLI convention)

1. Restore `public.recompute_order_status` from migration 000057.
2. Restore `support.tickets_resolution_chain` from migration 000057 (Step 2).
3. Un-cancel migration-cancelled tickets:
   ```sql
   update support.tickets set status='open', cancellation_reason=null, resolved_at=null
    where cancellation_reason like 'Auto-cancelled by unify-work-tracking-model%';
   ```
4. Re-run `recompute_order_status` for keys orders in `in_progress`/`ready_for_pickup`.

No CHECK constraint restoration needed if we adopted the "keep `key_installation` in domain" resolution above.

## Open Questions

- [ ] Confirm decision on Step d: leave `key_installation` in the CHECK to preserve historical cancelled rows, OR delete historical rows to enable a strict CHECK. Design recommends the former (audit-preserving); flag for spec author.
- [ ] `useOrderTareas` (admin `OrdenDetailPage`) filters tickets by `order_item_id`. After migration, former `key_installation` rows remain visible with `status='cancelled'` — acceptable per proposal (correct honest state), no UI change needed.

## Key Learnings

1. Postgres CHECK constraint validation scans every row on ALTER, so shrinking a domain requires either deleting or grandfathering historical values.
2. Migration ordering matters even within a single transactional file when triggers and constraints interact.
3. Soft-cancel preserves foreign-key integrity from `stock_movements.ticket_id` and downstream audit paths.
4. Reusing `recompute_order_status` in the backfill loop guarantees every status branch is evaluated correctly.
