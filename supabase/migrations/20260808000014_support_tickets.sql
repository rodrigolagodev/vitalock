-- ============================================================
-- SUPPORT schema — tickets de mantenimiento e instalación + comentarios
-- ============================================================
-- Modelo mínimo suficiente para el volumen actual:
--   * Sin prioridades ni SLA (se agregan si aparece la necesidad).
--   * Categorías fijas: 'maintenance' | 'installation'.
--   * Ticket vinculable a admin/building (obligatorios) y opcionalmente a
--     unit/equipment/bill/key_request para trazabilidad.
--   * Máquina de estados con reapertura.
--   * Auto-transición del equipo a 'maintenance' cuando arranca un ticket
--     de mantenimiento contra ese equipo específico (por explicit request
--     del negocio).

create schema if not exists support;

------------------------------------------------------------
-- Numeración humana
------------------------------------------------------------
create sequence support.ticket_number_seq;

create or replace function support.gen_ticket_number()
returns text language plpgsql as $$
begin
  return format('SOP-%s-%s',
                extract(year from now())::int,
                lpad(nextval('support.ticket_number_seq')::text, 6, '0'));
end;
$$;

------------------------------------------------------------
-- support.tickets
------------------------------------------------------------
create table support.tickets (
  id                     uuid        primary key default gen_random_uuid(),
  ticket_number          text        not null unique default support.gen_ticket_number(),

  -- Alcance: admin y edificio siempre; unit y equipment según el caso.
  administration_id      uuid        not null references public.administrations(id) on delete restrict,
  building_id            uuid        not null references public.buildings(id) on delete restrict,
  unit_id                uuid        references public.units(id) on delete restrict,
  equipment_id           uuid        references operations.equipment(id) on delete restrict,

  category               text        not null
                                     check (category in ('maintenance', 'installation')),
  description            text        not null,
  status                 text        not null default 'open'
                                     check (status in ('open','in_progress','resolved','cancelled')),

  -- Trazabilidad opcional a lo que originó / factura el ticket.
  related_bill_id        uuid        references sales.bills(id) on delete set null,
  related_key_request_id uuid        references sales.key_requests(id) on delete set null,

  -- Auditoría del ciclo del ticket.
  opened_at              timestamptz not null default now(),
  opened_by_staff_id     uuid        references identity.staff(id) on delete set null,
  assigned_to_staff_id   uuid        references identity.staff(id) on delete set null,
  resolved_at            timestamptz,
  resolved_by_staff_id   uuid        references identity.staff(id) on delete set null,
  resolution_notes       text,
  cancellation_reason    text,

  notes                  text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index tickets_administration_id_idx on support.tickets (administration_id);
create index tickets_building_id_idx       on support.tickets (building_id);
create index tickets_equipment_id_idx      on support.tickets (equipment_id) where equipment_id is not null;
create index tickets_status_idx            on support.tickets (status);
create index tickets_assigned_to_staff_id_idx
  on support.tickets (assigned_to_staff_id) where assigned_to_staff_id is not null;
-- Indice parcial para "abiertos asignados a mí" — la worklist del instalador.
create index tickets_open_assigned_idx
  on support.tickets (assigned_to_staff_id, status)
  where status in ('open','in_progress');

create trigger tickets_set_updated_at
before update on support.tickets
for each row execute function public.set_updated_at();

------------------------------------------------------------
-- Validación: coherencia cruzada + state machine
------------------------------------------------------------
create or replace function support.tickets_validate()
returns trigger language plpgsql as $$
declare
  v_building_admin      uuid;
  v_unit_building       uuid;
  v_equipment_building  uuid;
begin
  -- Coherencia: building pertenece a administration
  select administration_id into v_building_admin
    from public.buildings where id = new.building_id;
  if v_building_admin <> new.administration_id then
    raise exception 'building % belongs to administration %, but ticket is for administration %',
      new.building_id, v_building_admin, new.administration_id
      using errcode = 'check_violation';
  end if;

  -- Coherencia: unit pertenece a building
  if new.unit_id is not null then
    select building_id into v_unit_building
      from public.units where id = new.unit_id;
    if v_unit_building <> new.building_id then
      raise exception 'unit % is not in building %', new.unit_id, new.building_id
        using errcode = 'check_violation';
    end if;
  end if;

  -- Coherencia: equipment pertenece a building
  if new.equipment_id is not null then
    select building_id into v_equipment_building
      from operations.equipment where id = new.equipment_id;
    if v_equipment_building <> new.building_id then
      raise exception 'equipment % is not in building %', new.equipment_id, new.building_id
        using errcode = 'check_violation';
    end if;
  end if;

  -- Motivos requeridos por estado
  if new.status = 'resolved'
     and (new.resolution_notes is null or length(trim(new.resolution_notes)) = 0) then
    raise exception 'resolution_notes required when status=resolved'
      using errcode = 'check_violation';
  end if;
  if new.status = 'cancelled'
     and (new.cancellation_reason is null or length(trim(new.cancellation_reason)) = 0) then
    raise exception 'cancellation_reason required when status=cancelled'
      using errcode = 'check_violation';
  end if;

  if tg_op = 'INSERT' then
    return new;
  end if;

  -- UPDATE: inmutabilidades
  if new.administration_id is distinct from old.administration_id then
    raise exception 'tickets.administration_id is immutable' using errcode = 'check_violation';
  end if;
  if new.building_id is distinct from old.building_id then
    raise exception 'tickets.building_id is immutable' using errcode = 'check_violation';
  end if;
  if new.category is distinct from old.category then
    raise exception 'tickets.category is immutable' using errcode = 'check_violation';
  end if;
  if new.opened_by_staff_id is distinct from old.opened_by_staff_id
     or new.opened_at is distinct from old.opened_at then
    raise exception 'tickets.opened_by/at are immutable' using errcode = 'check_violation';
  end if;

  -- State machine (con reapertura resolved -> in_progress)
  if new.status is distinct from old.status then
    if not (
      (old.status = 'open'        and new.status in ('in_progress','cancelled'))
      or (old.status = 'in_progress' and new.status in ('resolved','cancelled'))
      or (old.status = 'resolved'    and new.status = 'in_progress')  -- reapertura
    ) then
      raise exception 'invalid tickets.status transition: % -> %', old.status, new.status
        using errcode = 'check_violation';
    end if;

    -- Auto-fill de timestamps al resolver / limpieza al reabrir
    if new.status = 'resolved' and old.status <> 'resolved' then
      new.resolved_at := coalesce(new.resolved_at, now());
    end if;
    if new.status = 'in_progress' and old.status = 'resolved' then
      new.resolved_at := null;
      new.resolved_by_staff_id := null;
      new.resolution_notes := null;
    end if;
  end if;

  return new;
end;
$$;

create trigger tickets_validate
before insert or update on support.tickets
for each row execute function support.tickets_validate();

------------------------------------------------------------
-- Auto-transición: ticket de mantenimiento sobre un equipo → equipo en maintenance
------------------------------------------------------------
-- Solo cuando el ticket:
--   * es de category='maintenance'
--   * está apuntando a un equipment específico (no NULL)
--   * pasa a in_progress
-- Y solo transiciona equipos que están 'active' (no toca dead ni ya en maintenance).
-- NO se transiciona de vuelta al resolver — el admin decide cuándo el equipo
-- vuelve a active.
create or replace function support.auto_transition_equipment_on_maintenance()
returns trigger language plpgsql as $$
begin
  if new.status = 'in_progress'
     and (tg_op = 'INSERT' or old.status <> 'in_progress')
     and new.equipment_id is not null
     and new.category = 'maintenance' then
    update operations.equipment
       set status = 'maintenance'
     where id = new.equipment_id
       and status = 'active';
  end if;
  return null;
end;
$$;

create trigger tickets_auto_transition_equipment
after insert or update of status on support.tickets
for each row execute function support.auto_transition_equipment_on_maintenance();

------------------------------------------------------------
-- support.ticket_comments — timeline interno del ticket
------------------------------------------------------------
create table support.ticket_comments (
  id              uuid        primary key default gen_random_uuid(),
  ticket_id       uuid        not null references support.tickets(id) on delete cascade,
  author_staff_id uuid        references identity.staff(id) on delete set null,
  body            text        not null,
  created_at      timestamptz not null default now()
);

create index ticket_comments_ticket_id_idx on support.ticket_comments (ticket_id);

-- Los comentarios son append-only por diseño: sin updated_at ni trigger de update.
-- Si alguien necesita "corregir", agrega otro comentario.
create or replace function support.ticket_comments_prevent_modification()
returns trigger language plpgsql as $$
begin
  raise exception 'ticket_comments are append-only' using errcode = 'check_violation';
end;
$$;

create trigger ticket_comments_no_update
before update on support.ticket_comments
for each row execute function support.ticket_comments_prevent_modification();

create trigger ticket_comments_no_delete
before delete on support.ticket_comments
for each row execute function support.ticket_comments_prevent_modification();

------------------------------------------------------------
-- Grants iniciales (RLS real llega en la siguiente migración)
------------------------------------------------------------
grant usage on schema support to authenticated, service_role;
grant all on all tables    in schema support to authenticated, service_role;
grant all on all sequences in schema support to authenticated, service_role;
grant all on all routines  in schema support to authenticated, service_role;

alter default privileges in schema support grant all on tables    to authenticated, service_role;
alter default privileges in schema support grant all on sequences to authenticated, service_role;
alter default privileges in schema support grant all on routines  to authenticated, service_role;

-- RLS habilitada; las policies reales se definen en la próxima migración.
alter table support.tickets         enable row level security;
alter table support.ticket_comments enable row level security;
