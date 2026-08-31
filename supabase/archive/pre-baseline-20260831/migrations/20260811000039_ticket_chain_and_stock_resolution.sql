-- ============================================================
-- Ticket resolution chain: key_configuration -> key_installation
-- ============================================================
-- AFTER UPDATE OF status on support.tickets. When a key_configuration
-- ticket transitions into 'resolved' (and only then), a key_installation
-- ticket is created for the same administration/building/unit.
--
-- Deliberately NOT handled here (per design decision, stock decrement lives
-- in the RPCs):
--   * equipment_installation resolutions -> resolve_equipment_installation
--     RPC (egreso_instalacion + liberacion_reserva). The trigger ignores
--     them to avoid a double egreso.
--   * key_configuration resolutions     -> configure_key_order_item RPC
--     emits egreso_grabacion + liberacion_reserva and resolves the ticket;
--     this trigger only spawns the follow-up key_installation ticket.
--
-- Cancelling a key_configuration ticket never chains (the trigger only
-- reacts to a transition INTO resolved). A key_installation ticket is
-- terminal: resolving it spawns nothing.

create or replace function support.tickets_resolution_chain()
returns trigger
language plpgsql
security definer
set search_path = support, public
as $$
begin
  -- Only a genuine transition into 'resolved' triggers the chain.
  if new.status <> 'resolved' or old.status = 'resolved' then
    return null;
  end if;

  if new.category = 'key_configuration' then
    insert into support.tickets (
      administration_id,
      building_id,
      unit_id,
      category,
      description,
      status,
      notes
    ) values (
      new.administration_id,
      new.building_id,
      new.unit_id,
      'key_installation',
      coalesce(nullif(trim(new.description), ''),
               'Instalación de llave'),
      'open',
      'Generado automáticamente al resolver ' || new.ticket_number
    );
  end if;

  return null;
end;
$$;

drop trigger if exists tickets_resolution_chain_trigger on support.tickets;

create trigger tickets_resolution_chain_trigger
after update of status on support.tickets
for each row execute function support.tickets_resolution_chain();
