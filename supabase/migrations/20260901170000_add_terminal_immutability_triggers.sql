-- add_terminal_immutability_triggers
--
-- Three BEFORE UPDATE trigger functions that reject any UPDATE against a row
-- whose OLD.status is terminal. Total row-level immutability, no whitelist,
-- no set_config bypass. Legitimate late transitions (completed → invoiced,
-- in_progress → resolved) all fire on non-terminal OLD.status, so they pass
-- through unaffected.
--
-- Terminal sets:
--   support.tickets            : {'resolved', 'cancelled'}
--   public.technical_orders    : {'invoiced', 'cancelled'}   -- NOT 'completed'
--   public.key_orders          : {'invoiced', 'cancelled'}   -- NOT 'completed'
--
-- 'completed' is intentionally excluded from the order terminal sets because
-- mark_technical_order_invoiced and mark_key_order_invoiced transition
-- 'completed' → 'invoiced'. Consistent with existing UI constant
-- TERMINAL_STATUSES in TechnicalOrderDetailPage.tsx.
--
-- Trigger execution ordering (BEFORE UPDATE, alphabetical):
--   support.tickets: 'tickets_terminal_immutable' (ti…) fires before
--   'tickets_validate' (tv…). The terminal guard rejects UPDATE before the
--   state-machine validator runs — the 'resolved → in_progress' branch in
--   tickets_validate becomes dead code (expected per "no reopen" decision).
--
-- Rollback: DROP the 3 triggers + 3 functions. No data reversal.


-- ============================================================================
-- 1. support.tickets_terminal_immutable
-- ============================================================================

CREATE OR REPLACE FUNCTION support.tickets_terminal_immutable()
    RETURNS trigger
    LANGUAGE plpgsql
AS $$
begin
  if OLD.status in ('resolved', 'cancelled') then
    raise exception 'TICKETS_TERMINAL: cannot modify % row (status: %)',
      TG_TABLE_NAME, OLD.status
      using errcode = 'P0001';
  end if;
  return NEW;
end;
$$;

CREATE TRIGGER tickets_terminal_immutable
  BEFORE UPDATE ON support.tickets
  FOR EACH ROW
  EXECUTE FUNCTION support.tickets_terminal_immutable();


-- ============================================================================
-- 2. public.technical_orders_terminal_immutable
-- ============================================================================

CREATE OR REPLACE FUNCTION public.technical_orders_terminal_immutable()
    RETURNS trigger
    LANGUAGE plpgsql
AS $$
begin
  if OLD.status in ('invoiced', 'cancelled') then
    raise exception 'TECHNICAL_ORDER_TERMINAL: cannot modify % row (status: %)',
      TG_TABLE_NAME, OLD.status
      using errcode = 'P0001';
  end if;
  return NEW;
end;
$$;

CREATE TRIGGER technical_orders_terminal_immutable
  BEFORE UPDATE ON public.technical_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.technical_orders_terminal_immutable();


-- ============================================================================
-- 3. public.key_orders_terminal_immutable
-- ============================================================================

CREATE OR REPLACE FUNCTION public.key_orders_terminal_immutable()
    RETURNS trigger
    LANGUAGE plpgsql
AS $$
begin
  if OLD.status in ('invoiced', 'cancelled') then
    raise exception 'KEY_ORDER_TERMINAL: cannot modify % row (status: %)',
      TG_TABLE_NAME, OLD.status
      using errcode = 'P0001';
  end if;
  return NEW;
end;
$$;

CREATE TRIGGER key_orders_terminal_immutable
  BEFORE UPDATE ON public.key_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.key_orders_terminal_immutable();
