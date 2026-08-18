-- ============================================================
-- Migration: tighten rfid_keys_sync_deactivated_at to design intent
-- ============================================================
-- Design says: "pending_disable → active clears any stale deactivated_at".
-- Previous trigger cleared deactivated_at for ANY non-disabled transition
-- (safe no-op in practice, but not aligned with design intent).
--
-- New semantics:
--   * status = 'disabled'                         → SET deactivated_at (if null or stale)
--   * OLD.status = 'pending_disable' AND
--     NEW.status = 'active'                        → CLEAR deactivated_at (cancel path)
--   * any other transition                         → leave deactivated_at unchanged
-- ============================================================

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
      -- Terminal state: stamp deactivated_at if not already set.
      if new.deactivated_at is null or new.deactivated_at = old.deactivated_at then
        new.deactivated_at := now();
      end if;
    elsif old.status = 'pending_disable' and new.status = 'active' then
      -- Cancel path only: clear the timestamp.
      new.deactivated_at := null;
    end if;
    -- All other transitions leave deactivated_at unchanged.
  end if;
  return new;
end;
$$;
