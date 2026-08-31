-- ============================================================
-- Stock counter maintenance triggers
-- ============================================================
-- Two triggers on public.stock_movements:
--
--   1. stock_movements_prevent_modification (BEFORE UPDATE/DELETE)
--      Raises check_violation unconditionally — ledger is append-only.
--
--   2. stock_movements_maintain_counters (AFTER INSERT)
--      Increments/decrements public.products.stock_total and
--      .stock_reservado based on the movement type. The products table
--      carries a CHECK (stock_reservado <= stock_total) that raises
--      automatically on oversell.

------------------------------------------------------------
-- 1. Prevent modification — append-only ledger
------------------------------------------------------------
create or replace function public.stock_movements_prevent_modification()
returns trigger
language plpgsql
as $$
begin
  raise exception 'stock_movements are append-only'
    using errcode = 'check_violation';
end;
$$;

create trigger stock_movements_no_update
before update on public.stock_movements
for each row execute function public.stock_movements_prevent_modification();

create trigger stock_movements_no_delete
before delete on public.stock_movements
for each row execute function public.stock_movements_prevent_modification();

------------------------------------------------------------
-- 2. Maintain derived counters on public.products
------------------------------------------------------------
create or replace function public.stock_movements_maintain_counters()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_total_delta     int := 0;
  v_reservado_delta int := 0;
begin
  -- Determine how each type affects the two counters.
  -- stock_total reflects physical stock (compras, egresos definitivos, ajustes).
  -- stock_reservado tracks reserved-but-not-yet-consumed units.
  case new.type
    when 'compra'              then v_total_delta     :=  new.quantity;   -- positive
    when 'devolucion'          then v_total_delta     :=  new.quantity;   -- positive
    when 'ajuste_manual'       then v_total_delta     :=  new.quantity;   -- any sign
    when 'egreso_grabacion'    then v_total_delta     :=  new.quantity;   -- negative → subtract
    when 'egreso_instalacion'  then v_total_delta     :=  new.quantity;   -- negative → subtract
    when 'baja_defectuoso'     then v_total_delta     :=  new.quantity;   -- negative → subtract
    when 'baja_perdida'        then v_total_delta     :=  new.quantity;   -- negative → subtract
    when 'reserva'             then v_reservado_delta :=  -new.quantity;  -- qty is negative; negate → subtract
    when 'liberacion_reserva'  then v_reservado_delta := -new.quantity;   -- qty is positive; negate → release
    else
      raise exception 'stock_movements_maintain_counters: unknown type %', new.type
        using errcode = 'P0001';
  end case;

  -- Definitive egresos that consume a reservation must release it.
  -- The trigger relies on the RPC to emit a paired liberacion_reserva; this
  -- trigger only handles the egreso side (total decrement).

  update public.products
     set stock_total     = stock_total     + v_total_delta,
         stock_reservado = stock_reservado + v_reservado_delta
   where id = new.product_id;

  -- The products table CHECK (stock_reservado <= stock_total) and
  -- CHECK (stock_total >= 0) / CHECK (stock_reservado >= 0) will raise
  -- automatically if the update would violate them.

  return null;
end;
$$;

create trigger stock_movements_maintain_counters
after insert on public.stock_movements
for each row execute function public.stock_movements_maintain_counters();
