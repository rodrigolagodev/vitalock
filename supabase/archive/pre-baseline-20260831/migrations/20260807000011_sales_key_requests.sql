-- ============================================================
-- SALES schema — key requests and deliveries (fase 1, sin facturación)
-- ============================================================
-- Flujo modelado:
--   1) Admin o particular pide una llave por WhatsApp.
--   2) Vitalock registra la solicitud (key_requests). Si el solicitante es la
--      administración se auto-autoriza; si es un particular queda pendiente
--      de que la administración confirme.
--   3) Una vez autorizada, se produce la(s) llave(s) con el lector — cada
--      rfid_key nace referenciando la línea (key_request_item) que la generó.
--   4) La persona autorizada retira las llaves; se registra por-llave quién
--      retiró y cuándo.
--
-- El estado de la solicitud se mueve solo (via triggers sobre rfid_keys) a
-- medida que las llaves se producen y se retiran. Rechazos y cancelaciones
-- son siempre manuales.

create schema if not exists sales;

------------------------------------------------------------
-- Sequence + helper for the human-friendly request number
------------------------------------------------------------
create sequence sales.key_request_number_seq;

create or replace function sales.gen_key_request_number()
returns text
language plpgsql
as $$
begin
  return format('REQ-%s-%s',
                extract(year from now())::int,
                lpad(nextval('sales.key_request_number_seq')::text, 6, '0'));
end;
$$;

------------------------------------------------------------
-- sales.key_requests — el header de la solicitud
------------------------------------------------------------
create table sales.key_requests (
  id                        uuid        primary key default gen_random_uuid(),
  request_number            text        not null unique default sales.gen_key_request_number(),
  administration_id         uuid        not null
                                        references public.administrations(id)
                                        on delete restrict,

  -- Quién originó la solicitud.
  requester_type            text        not null
                                        check (requester_type in ('administration', 'individual')),
  requester_name            text,       -- obligatorio siempre (chequeado por trigger)
  requester_surname         text,       -- obligatorio si requester_type='individual'
  requester_dni             text,       -- obligatorio si requester_type='individual'
  requester_contact         text,       -- obligatorio si requester_type='individual' (whatsapp/tel/email)

  -- Persona autorizada a retirar TODAS las llaves de esta solicitud.
  -- Puede quedar NULL mientras el pedido está pending_authorization
  -- (para 'individual' se completa cuando la admin autoriza).
  -- Trigger enforce: no puede estar NULL una vez que status >= 'authorized'.
  pickup_person_name        text,
  pickup_person_surname     text,
  pickup_person_dni         text,

  status                    text        not null default 'pending_authorization'
                                        check (status in (
                                          'pending_authorization',
                                          'authorized',
                                          'in_production',
                                          'ready_for_pickup',
                                          'delivered',
                                          'rejected',
                                          'cancelled'
                                        )),

  -- Meta del canal de ingreso.
  received_at               timestamptz not null default now(),
  received_by_staff_id      uuid        references identity.staff(id) on delete set null,

  -- Autorización.
  authorized_by             text,       -- nombre libre del referente de la admin que autorizó
  authorized_at             timestamptz,
  authorization_method      text        check (authorization_method in ('whatsapp','email','phone','in_person','self')),

  -- Terminación.
  rejection_reason          text        check (rejection_reason in (
                                          'not_authorized_by_administration',
                                          'data_mismatch',
                                          'security_concern',
                                          'other'
                                        )),
  rejection_notes           text,
  cancellation_reason       text,

  notes                     text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index key_requests_administration_id_idx on sales.key_requests (administration_id);
create index key_requests_status_idx            on sales.key_requests (status);
create index key_requests_received_at_idx       on sales.key_requests (received_at);

create trigger key_requests_set_updated_at
before update on sales.key_requests
for each row execute function public.set_updated_at();

------------------------------------------------------------
-- sales.key_request_items — las líneas de la solicitud
------------------------------------------------------------
-- Cada línea es "N llaves para la unidad X". Una solicitud puede tener N
-- líneas apuntando a distintas unidades (incluso de distintos edificios de
-- la misma administración).
create table sales.key_request_items (
  id                uuid        primary key default gen_random_uuid(),
  key_request_id    uuid        not null
                                references sales.key_requests(id)
                                on delete restrict,
  unit_id           uuid        not null
                                references public.units(id)
                                on delete restrict,
  quantity          int         not null check (quantity > 0),
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index key_request_items_key_request_id_idx on sales.key_request_items (key_request_id);
create index key_request_items_unit_id_idx        on sales.key_request_items (unit_id);

create trigger key_request_items_set_updated_at
before update on sales.key_request_items
for each row execute function public.set_updated_at();

------------------------------------------------------------
-- rfid_keys — nuevas columnas para linkear con la producción y el retiro
------------------------------------------------------------
alter table public.rfid_keys
  add column key_request_item_id     uuid references sales.key_request_items(id) on delete restrict,
  add column picked_up_at            timestamptz,
  add column picked_up_by_name       text,
  add column picked_up_by_surname    text,
  add column picked_up_by_dni        text,
  add column delivered_by_staff_id   uuid references identity.staff(id) on delete set null;

create index rfid_keys_key_request_item_id_idx on public.rfid_keys (key_request_item_id);
create index rfid_keys_picked_up_at_idx        on public.rfid_keys (picked_up_at)
  where picked_up_at is not null;

------------------------------------------------------------
-- key_requests validation trigger
------------------------------------------------------------
-- Valida:
--   * requester fields según requester_type (individual necesita más datos)
--   * pickup_person completo si status >= authorized
--   * authorized_by/at/method completos si status >= authorized
--   * rejection_reason presente si status='rejected'
--   * cancellation_reason presente si status='cancelled'
--   * INSERT: si requester_type='administration', status arranca en 'authorized'
--     (self-auth); si es 'individual', arranca en 'pending_authorization'
--   * UPDATE: valida transiciones del estado
create or replace function sales.key_requests_validate()
returns trigger
language plpgsql
as $$
declare
  status_is_at_least_authorized boolean;
begin
  status_is_at_least_authorized := new.status in (
    'authorized', 'in_production', 'ready_for_pickup', 'delivered'
  );

  -- Datos del solicitante
  if new.requester_name is null or length(trim(new.requester_name)) = 0 then
    raise exception 'requester_name is required'
      using errcode = 'check_violation';
  end if;
  if new.requester_type = 'individual' then
    if new.requester_surname is null or new.requester_dni is null
       or new.requester_contact is null then
      raise exception
        'individual requester must have surname, dni and contact'
        using errcode = 'check_violation';
    end if;
  end if;

  -- Datos del retirador: obligatorios cuando la solicitud pasa a autorizada.
  if status_is_at_least_authorized then
    if new.pickup_person_name    is null
       or new.pickup_person_surname is null
       or new.pickup_person_dni  is null then
      raise exception
        'pickup person (name, surname, dni) is required once status is authorized'
        using errcode = 'check_violation';
    end if;
    if new.authorized_by is null or new.authorized_at is null or new.authorization_method is null then
      raise exception
        'authorized_by, authorized_at and authorization_method are required once status is authorized'
        using errcode = 'check_violation';
    end if;
  end if;

  if new.status = 'rejected' and new.rejection_reason is null then
    raise exception 'rejection_reason is required when status=rejected'
      using errcode = 'check_violation';
  end if;
  if new.status = 'cancelled' and (new.cancellation_reason is null or length(trim(new.cancellation_reason)) = 0) then
    raise exception 'cancellation_reason is required when status=cancelled'
      using errcode = 'check_violation';
  end if;

  -- INSERT: fijar estado inicial y autorización self-auth para administraciones.
  if tg_op = 'INSERT' then
    if new.requester_type = 'administration' then
      -- Auto-autorización: si status quedó en el default, lo bumpeamos.
      if new.status = 'pending_authorization' then
        new.status              := 'authorized';
        new.authorized_by       := coalesce(new.authorized_by, new.requester_name);
        new.authorized_at       := coalesce(new.authorized_at, now());
        new.authorization_method := coalesce(new.authorization_method, 'self');
      end if;
    end if;
    return new;
  end if;

  -- UPDATE: validar transiciones del estado. Se permite "saltar hacia
  -- adelante" (por ejemplo authorized → ready_for_pickup si todas las llaves
  -- se producen en una sola operacion) porque los AFTER triggers de un
  -- multi-row INSERT ven todas las filas al mismo tiempo. Lo que NO se
  -- permite es ir hacia atras ni salir de estados terminales.
  if new.status is distinct from old.status then
    if not (
      (old.status = 'pending_authorization' and new.status in ('authorized','rejected','cancelled'))
      or (old.status = 'authorized'         and new.status in ('in_production','ready_for_pickup','delivered','cancelled'))
      or (old.status = 'in_production'      and new.status in ('ready_for_pickup','delivered','cancelled'))
      or (old.status = 'ready_for_pickup'   and new.status in ('delivered','cancelled'))
    ) then
      raise exception 'invalid key_requests.status transition: % -> %',
        old.status, new.status
        using errcode = 'check_violation';
    end if;
  end if;

  -- Una vez autorizada, los datos del retirador son inmutables (esa es la
  -- garantía de seguridad — la admin autorizó a esa persona específicamente).
  if old.status in ('authorized','in_production','ready_for_pickup','delivered') then
    if new.pickup_person_dni is distinct from old.pickup_person_dni
       or new.pickup_person_name is distinct from old.pickup_person_name
       or new.pickup_person_surname is distinct from old.pickup_person_surname then
      raise exception 'pickup person data is immutable once the request is authorized'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

create trigger key_requests_validate
before insert or update on sales.key_requests
for each row execute function sales.key_requests_validate();

------------------------------------------------------------
-- key_request_items: unidad del item debe ser de un edificio de la administracion
-- del pedido; ademas, quantity no puede modificarse cuando ya hay llaves
-- producidas contra la linea (sobrepasarse rompe el fulfillment).
------------------------------------------------------------
create or replace function sales.key_request_items_validate()
returns trigger
language plpgsql
as $$
declare
  v_request_admin uuid;
  v_unit_admin    uuid;
  v_produced      int;
begin
  select kr.administration_id
    into v_request_admin
    from sales.key_requests kr
   where kr.id = new.key_request_id;

  select b.administration_id
    into v_unit_admin
    from public.units u
    join public.buildings b on b.id = u.building_id
   where u.id = new.unit_id;

  if v_request_admin <> v_unit_admin then
    raise exception
      'unit % belongs to administration %, but the request is for administration %',
      new.unit_id, v_unit_admin, v_request_admin
      using errcode = 'check_violation';
  end if;

  if tg_op = 'UPDATE' then
    if new.key_request_id is distinct from old.key_request_id
       or new.unit_id     is distinct from old.unit_id then
      raise exception 'key_request_id and unit_id are immutable';
    end if;

    if new.quantity < old.quantity then
      select count(*) into v_produced
        from public.rfid_keys where key_request_item_id = old.id;
      if new.quantity < v_produced then
        raise exception
          'cannot reduce quantity below already-produced count (produced=%, new quantity=%)',
          v_produced, new.quantity
          using errcode = 'check_violation';
      end if;
    end if;
  end if;

  return new;
end;
$$;

create trigger key_request_items_validate
before insert or update on sales.key_request_items
for each row execute function sales.key_request_items_validate();

------------------------------------------------------------
-- rfid_keys: extend the existing immutability + validation triggers
------------------------------------------------------------

-- Extender la inmutabilidad para incluir key_request_item_id.
-- Los campos de pickup se manejan aparte: son mutables hasta que se completen,
-- despues inmutables.
create or replace function public.rfid_keys_prevent_reassignment()
returns trigger
language plpgsql
as $$
begin
  if new.unit_id is distinct from old.unit_id then
    raise exception 'rfid_keys.unit_id is immutable (key %)', old.id
      using errcode = 'check_violation';
  end if;
  if new.rfid_code is distinct from old.rfid_code then
    raise exception 'rfid_keys.rfid_code is immutable (key %)', old.id
      using errcode = 'check_violation';
  end if;
  if new.key_request_item_id is distinct from old.key_request_item_id then
    raise exception 'rfid_keys.key_request_item_id is immutable (key %)', old.id
      using errcode = 'check_violation';
  end if;
  -- Los campos de pickup, una vez seteados, no se pueden cambiar:
  -- esa es la evidencia del retiro.
  if old.picked_up_at is not null then
    if new.picked_up_at        is distinct from old.picked_up_at
       or new.picked_up_by_name    is distinct from old.picked_up_by_name
       or new.picked_up_by_surname is distinct from old.picked_up_by_surname
       or new.picked_up_by_dni     is distinct from old.picked_up_by_dni
       or new.delivered_by_staff_id is distinct from old.delivered_by_staff_id then
      raise exception 'rfid_keys pickup fields are immutable once picked_up_at is set (key %)', old.id
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

-- Al INSERTAR una rfid_key ligada a un key_request_item:
--   * la unidad de la llave debe coincidir con la unidad de la línea (chequeo cruzado)
--   * no se puede exceder la quantity de la línea
--   * la solicitud debe estar en un estado que permita producción (authorized o in_production)
create or replace function public.rfid_keys_validate_request_link()
returns trigger
language plpgsql
as $$
declare
  v_item_unit_id  uuid;
  v_item_qty      int;
  v_produced_now  int;
  v_request_status text;
begin
  if new.key_request_item_id is null then
    return new;
  end if;

  select kri.unit_id, kri.quantity, kr.status
    into v_item_unit_id, v_item_qty, v_request_status
    from sales.key_request_items kri
    join sales.key_requests kr on kr.id = kri.key_request_id
   where kri.id = new.key_request_item_id;

  if v_item_unit_id <> new.unit_id then
    raise exception
      'rfid_keys.unit_id (%) does not match key_request_items.unit_id (%)',
      new.unit_id, v_item_unit_id
      using errcode = 'check_violation';
  end if;

  if v_request_status not in ('authorized','in_production') then
    raise exception
      'cannot produce a key for a request in status % (only authorized/in_production allow production)',
      v_request_status
      using errcode = 'check_violation';
  end if;

  select count(*) into v_produced_now
    from public.rfid_keys
   where key_request_item_id = new.key_request_item_id;
  if v_produced_now + 1 > v_item_qty then
    raise exception
      'cannot produce more keys than requested for this line (line quantity=%, already produced=%)',
      v_item_qty, v_produced_now
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger rfid_keys_validate_request_link
before insert on public.rfid_keys
for each row execute function public.rfid_keys_validate_request_link();

-- Al marcar el retiro (setear picked_up_at + campos): validar que el DNI
-- coincide con el pickup_person_dni de la solicitud.
create or replace function public.rfid_keys_validate_pickup()
returns trigger
language plpgsql
as $$
declare
  v_authorized_dni text;
  v_request_status text;
begin
  if new.picked_up_at is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.picked_up_at is not null then
    return new;  -- ya validado antes; inmutabilidad la enforce el otro trigger
  end if;

  if new.picked_up_by_name is null or new.picked_up_by_surname is null or new.picked_up_by_dni is null then
    raise exception 'pickup fields (name, surname, dni) are required to set picked_up_at (key %)', new.id
      using errcode = 'check_violation';
  end if;
  if new.key_request_item_id is null then
    raise exception 'cannot record pickup on a key without a key_request_item_id (key %)', new.id
      using errcode = 'check_violation';
  end if;

  select kr.pickup_person_dni, kr.status
    into v_authorized_dni, v_request_status
    from sales.key_request_items kri
    join sales.key_requests kr on kr.id = kri.key_request_id
   where kri.id = new.key_request_item_id;

  if v_request_status not in ('ready_for_pickup','delivered') then
    raise exception
      'cannot pickup a key while the request is in status % (must be ready_for_pickup)',
      v_request_status
      using errcode = 'check_violation';
  end if;

  if new.picked_up_by_dni <> v_authorized_dni then
    raise exception
      'pickup DNI (%) does not match the authorized pickup person DNI (%) for this request',
      new.picked_up_by_dni, v_authorized_dni
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger rfid_keys_validate_pickup
before insert or update of picked_up_at, picked_up_by_dni, picked_up_by_name, picked_up_by_surname
on public.rfid_keys
for each row execute function public.rfid_keys_validate_pickup();

------------------------------------------------------------
-- Auto-transitions del estado de la solicitud
------------------------------------------------------------
-- Disparadas por eventos sobre rfid_keys:
--   * INSERT de rfid_keys con key_request_item_id → si la solicitud está
--     'authorized' pasa a 'in_production'. Si al insertar se completa la
--     producción (count = sum(qty)), pasa directo a 'ready_for_pickup'.
--   * UPDATE de rfid_keys.picked_up_at (de null a not null) → si todas las
--     llaves de la solicitud tienen picked_up_at, pasa a 'delivered'.
create or replace function sales.recompute_request_status(p_request_id uuid)
returns void
language plpgsql
as $$
declare
  v_current_status text;
  v_total_qty     int;
  v_produced      int;
  v_picked_up     int;
  v_target_status text;
begin
  select status into v_current_status
    from sales.key_requests
   where id = p_request_id
   for update;

  if v_current_status not in ('authorized','in_production','ready_for_pickup') then
    return;  -- estados terminales o pre-producción no se tocan
  end if;

  -- Cuentas separadas para evitar duplicación por el JOIN.
  select coalesce(sum(quantity), 0)
    into v_total_qty
    from sales.key_request_items
   where key_request_id = p_request_id;

  select count(*),
         count(*) filter (where rk.picked_up_at is not null)
    into v_produced, v_picked_up
    from public.rfid_keys rk
    join sales.key_request_items kri on kri.id = rk.key_request_item_id
   where kri.key_request_id = p_request_id;

  if v_total_qty = 0 then
    return;  -- solicitud sin líneas todavía
  end if;

  if v_produced = v_total_qty and v_picked_up = v_total_qty then
    v_target_status := 'delivered';
  elsif v_produced = v_total_qty then
    v_target_status := 'ready_for_pickup';
  elsif v_produced > 0 then
    v_target_status := 'in_production';
  else
    return;  -- no hay llaves aún, no tocar
  end if;

  if v_target_status <> v_current_status then
    update sales.key_requests
       set status = v_target_status
     where id = p_request_id;
  end if;
end;
$$;

create or replace function public.rfid_keys_trigger_request_recompute()
returns trigger
language plpgsql
as $$
declare
  v_request_id uuid;
begin
  if tg_op = 'INSERT' then
    if new.key_request_item_id is not null then
      select key_request_id into v_request_id
        from sales.key_request_items where id = new.key_request_item_id;
      perform sales.recompute_request_status(v_request_id);
    end if;
  elsif tg_op = 'UPDATE' then
    if new.picked_up_at is distinct from old.picked_up_at and new.key_request_item_id is not null then
      select key_request_id into v_request_id
        from sales.key_request_items where id = new.key_request_item_id;
      perform sales.recompute_request_status(v_request_id);
    end if;
  end if;
  return null;
end;
$$;

create trigger rfid_keys_trigger_request_recompute
after insert or update of picked_up_at on public.rfid_keys
for each row execute function public.rfid_keys_trigger_request_recompute();

------------------------------------------------------------
-- RLS placeholder + revocar acceso a anon (mismo criterio que operations)
------------------------------------------------------------
alter table sales.key_requests      enable row level security;
alter table sales.key_request_items enable row level security;

create policy "authenticated_all_key_requests"
  on sales.key_requests
  for all to authenticated
  using (true) with check (true);

create policy "authenticated_all_key_request_items"
  on sales.key_request_items
  for all to authenticated
  using (true) with check (true);

grant usage on schema sales to authenticated, service_role;
grant all on all tables    in schema sales to authenticated, service_role;
grant all on all sequences in schema sales to authenticated, service_role;
grant all on all routines  in schema sales to authenticated, service_role;

alter default privileges in schema sales
  grant all on tables    to authenticated, service_role;
alter default privileges in schema sales
  grant all on sequences to authenticated, service_role;
alter default privileges in schema sales
  grant all on routines  to authenticated, service_role;
