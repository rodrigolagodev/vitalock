-- ============================================================
-- Migration: rfid_keys 5-state lifecycle CHECK + sync_deactivated_at update
-- ============================================================
-- Expands rfid_keys.status to the 5-state machine:
--   pending_creation → pending_installation → active ↔ pending_disable → disabled
--
-- Co-migrates the CHECK and the sync_deactivated_at trigger together to
-- avoid the CHECK+trigger split issue (ref: counter-trigger incident, 000061).
--
-- Rollback: see design.md §Migration/Rollout for manual steps.
-- ============================================================

-- -------------------------------------------------------
-- (1) Expand rfid_keys.status CHECK to 5 states
-- -------------------------------------------------------
alter table public.rfid_keys drop constraint rfid_keys_status_check;
alter table public.rfid_keys add constraint rfid_keys_status_check
  check (status in (
    'pending_creation',
    'pending_installation',
    'active',
    'pending_disable',
    'disabled'
  ));

-- -------------------------------------------------------
-- (2) Update rfid_keys_sync_deactivated_at trigger function
-- -------------------------------------------------------
-- New semantics:
--   * 'disabled' (terminal) → set deactivated_at if not already set
--   * 'pending_disable'     → do NOT set deactivated_at (reversible)
--   * any other status      → clear deactivated_at (including pending_disable → active)
create or replace function public.rfid_keys_sync_deactivated_at()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'disabled' and new.deactivated_at is null then
      new.deactivated_at := now();
    end if;
    return new;
  end if;

  -- UPDATE path: only act when status changes.
  if new.status is distinct from old.status then
    if new.status = 'disabled' then
      if new.deactivated_at is null or new.deactivated_at = old.deactivated_at then
        new.deactivated_at := now();
      end if;
    else
      -- All non-disabled transitions clear deactivated_at.
      -- This handles pending_disable → active explicitly.
      new.deactivated_at := null;
    end if;
  end if;
  return new;
end;
$$;
