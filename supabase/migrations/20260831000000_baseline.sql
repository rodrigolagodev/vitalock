-- ============================================================
-- Vitalock — Baseline migration (squash de 109 migraciones previas)
-- ============================================================
-- Generado: 2026-08-31 con
--   supabase db dump --local --schema public,identity,operations,sales,support
-- Historia previa archivada en supabase/archive/pre-baseline-20260831/.
--
-- Estructura:
--   1. Extensions requeridas (pgcrypto, pgtap)
--   2. Schemas + DDL de public/identity/operations/sales/support (dump)
--   3. Storage bucket + policies para equipment-updates-mdb
--   4. pg_cron job para recurring charges (defensivo)
-- ============================================================

-- ------------------------------------------------------------
-- 1. Extensions
-- ------------------------------------------------------------
create extension if not exists pgcrypto;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists pgtap with schema extensions;

-- ------------------------------------------------------------
-- 2. Schemas + DDL (dumped from local DB)
-- ------------------------------------------------------------



SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "identity";


ALTER SCHEMA "identity" OWNER TO "postgres";


CREATE SCHEMA IF NOT EXISTS "operations";


ALTER SCHEMA "operations" OWNER TO "postgres";


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'search_path hardening applied 2026-08-17: every SECURITY DEFINER function in public/operations/sales/support now runs with a fixed schema list. New SECURITY DEFINER functions MUST include SET search_path in their definition.';



CREATE SCHEMA IF NOT EXISTS "sales";


ALTER SCHEMA "sales" OWNER TO "postgres";


CREATE SCHEMA IF NOT EXISTS "support";


ALTER SCHEMA "support" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "identity"."current_staff_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select id from identity.staff where auth_user_id = auth.uid();
$$;


ALTER FUNCTION "identity"."current_staff_id"() OWNER TO "postgres";


COMMENT ON FUNCTION "identity"."current_staff_id"() IS 'Returns the identity.staff.id of the currently authenticated user, or NULL.';



CREATE OR REPLACE FUNCTION "identity"."current_staff_role"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select role from identity.staff where auth_user_id = auth.uid();
$$;


ALTER FUNCTION "identity"."current_staff_role"() OWNER TO "postgres";


COMMENT ON FUNCTION "identity"."current_staff_role"() IS 'Returns the role of the currently authenticated staff, or NULL if not staff.';



CREATE OR REPLACE FUNCTION "identity"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select coalesce(
    (select role = 'admin' from identity.staff
      where auth_user_id = auth.uid() and status = 'active'),
    false
  );
$$;


ALTER FUNCTION "identity"."is_admin"() OWNER TO "postgres";


COMMENT ON FUNCTION "identity"."is_admin"() IS 'Marker: cuando se agreguen usuarios de administración/particulares, esta función NO debe volverse true para ellos. La extensión debería agregar is_admin_user(admin_id) y policies adicionales.';



CREATE OR REPLACE FUNCTION "identity"."is_installer"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select coalesce(
    (select role = 'installer' from identity.staff
      where auth_user_id = auth.uid() and status = 'active'),
    false
  );
$$;


ALTER FUNCTION "identity"."is_installer"() OWNER TO "postgres";


COMMENT ON FUNCTION "identity"."is_installer"() IS 'True when the current auth user is an active staff member with role=installer.';



CREATE OR REPLACE FUNCTION "identity"."record_staff_audit_event"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_actor uuid := identity.current_staff_id();
begin
  if tg_op = 'INSERT' then
    insert into identity.audit_log (actor_id, subject_id, event_type, after_value)
    values (v_actor, new.id, 'created', new.role || ':' || new.status);
    return new;
  end if;

  if tg_op = 'DELETE' then
    insert into identity.audit_log (actor_id, subject_id, event_type, before_value)
    values (v_actor, old.id, 'deleted', old.role || ':' || old.status);
    return old;
  end if;

  -- UPDATE
  if new.role is distinct from old.role then
    insert into identity.audit_log (actor_id, subject_id, event_type, before_value, after_value)
    values (v_actor, new.id, 'role_changed', old.role, new.role);
  end if;

  if new.status is distinct from old.status then
    insert into identity.audit_log (actor_id, subject_id, event_type, before_value, after_value)
    values (v_actor, new.id, 'status_changed', old.status, new.status);
  end if;

  return new;
end;
$$;


ALTER FUNCTION "identity"."record_staff_audit_event"() OWNER TO "postgres";


COMMENT ON FUNCTION "identity"."record_staff_audit_event"() IS 'Append-only writer for identity.audit_log. Runs SECURITY DEFINER to bypass RLS on the log table so audit rows are written regardless of caller role.';



CREATE OR REPLACE FUNCTION "operations"."enforce_installer_key_auth_column_restrictions"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_role text := identity.current_staff_role();
  v_staff_id uuid := identity.current_staff_id();
begin
  if v_role is distinct from 'installer' then
    return new;
  end if;

  if new.installed_at is distinct from old.installed_at then
    raise exception 'installer cannot modify installed_at (auto-filled)'
      using errcode = 'insufficient_privilege';
  end if;

  if new.removed_at is distinct from old.removed_at then
    raise exception 'installer cannot modify removed_at (auto-filled)'
      using errcode = 'insufficient_privilege';
  end if;

  if new.created_at is distinct from old.created_at then
    raise exception 'installer cannot modify created_at'
      using errcode = 'insufficient_privilege';
  end if;

  if new.installed_by_staff_id is distinct from old.installed_by_staff_id
     and new.installed_by_staff_id is distinct from v_staff_id then
    raise exception 'installer can only attribute installed_by_staff_id to self'
      using errcode = 'insufficient_privilege';
  end if;

  if new.removed_by_staff_id is distinct from old.removed_by_staff_id
     and new.removed_by_staff_id is distinct from v_staff_id then
    raise exception 'installer can only attribute removed_by_staff_id to self'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "operations"."enforce_installer_key_auth_column_restrictions"() OWNER TO "postgres";


COMMENT ON FUNCTION "operations"."enforce_installer_key_auth_column_restrictions"() IS 'Blocks installer role from modifying audit columns on key_authorizations (timestamps, created_at) and forces self-attribution on *_by_staff_id.';



CREATE OR REPLACE FUNCTION "operations"."equipment_close_authorizations_on_dead"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.status = 'dead' and old.status <> 'dead' then
    -- installed -> pending_removal -> removed
    update operations.key_authorizations
       set sync_state = 'pending_removal'
     where equipment_id = new.id
       and sync_state   = 'installed';

    update operations.key_authorizations
       set sync_state    = 'removed',
           remove_reason = coalesce(remove_reason, 'Equipment marked as dead')
     where equipment_id = new.id
       and sync_state   = 'pending_removal'
       and removed_at is null;

    -- pending_install -> removed (never made it to the device)
    update operations.key_authorizations
       set sync_state    = 'removed',
           remove_reason = 'Equipment marked as dead before install'
     where equipment_id = new.id
       and sync_state   = 'pending_install';
  end if;
  return null;
end;
$$;


ALTER FUNCTION "operations"."equipment_close_authorizations_on_dead"() OWNER TO "postgres";


COMMENT ON FUNCTION "operations"."equipment_close_authorizations_on_dead"() IS 'Trigger AFTER UPDATE OF status: cuando el equipo pasa a dead, cierra todas sus key_authorizations (installed → pending_removal → removed, y pending_install → removed directamente). Evita autorizaciones colgadas en equipos que ya no existen físicamente.';



CREATE OR REPLACE FUNCTION "operations"."equipment_prevent_reassignment"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.serial_number is distinct from old.serial_number then
    raise exception 'operations.equipment.serial_number is immutable (id %)', old.id
      using errcode = 'check_violation';
  end if;
  if new.building_id is distinct from old.building_id then
    raise exception 'operations.equipment.building_id is immutable (id %)', old.id
      using errcode = 'check_violation';
  end if;
  if new.replaces_equipment_id is distinct from old.replaces_equipment_id then
    raise exception 'operations.equipment.replaces_equipment_id is immutable (id %)', old.id
      using errcode = 'check_violation';
  end if;
  if new.installed_at is distinct from old.installed_at then
    raise exception 'operations.equipment.installed_at is immutable (id %)', old.id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "operations"."equipment_prevent_reassignment"() OWNER TO "postgres";


COMMENT ON FUNCTION "operations"."equipment_prevent_reassignment"() IS 'Trigger BEFORE UPDATE: bloquea cambios a serial_number, building_id, replaces_equipment_id, installed_at. Un equipo vive y muere donde se instaló; los reemplazos son rows nuevas.';



CREATE OR REPLACE FUNCTION "operations"."equipment_sync_decommissioned_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'dead' and new.decommissioned_at is null then
      new.decommissioned_at := now();
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    if new.status = 'dead' then
      if new.decommissioned_at is null or new.decommissioned_at = old.decommissioned_at then
        new.decommissioned_at := now();
      end if;
    else
      -- Any transition away from dead clears the timestamp. In practice this
      -- only happens if a status was set to 'dead' by mistake and corrected
      -- before it settled; a truly dead equipment does not come back.
      new.decommissioned_at := null;
    end if;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "operations"."equipment_sync_decommissioned_at"() OWNER TO "postgres";


COMMENT ON FUNCTION "operations"."equipment_sync_decommissioned_at"() IS 'Trigger BEFORE INSERT/UPDATE: sincroniza decommissioned_at con status=dead. Se completa al morir, se limpia si por error se marca como dead y se corrige antes de settle.';



CREATE OR REPLACE FUNCTION "operations"."equipment_validate_replacement"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  predecessor operations.equipment%rowtype;
begin
  if new.replaces_equipment_id is null then
    return new;
  end if;

  select * into predecessor
  from operations.equipment
  where id = new.replaces_equipment_id;

  if predecessor.building_id <> new.building_id then
    raise exception
      'replacement must be at the same building (predecessor % is at %, new is at %)',
      predecessor.id, predecessor.building_id, new.building_id
      using errcode = 'check_violation';
  end if;

  if predecessor.status <> 'dead' then
    raise exception
      'predecessor equipment % must be status=dead to be replaced (current: %)',
      predecessor.id, predecessor.status
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "operations"."equipment_validate_replacement"() OWNER TO "postgres";


COMMENT ON FUNCTION "operations"."equipment_validate_replacement"() IS 'Trigger BEFORE INSERT: valida que replaces_equipment_id (si se seteó) apunte a un equipo del MISMO edificio y en status=dead. Preserva la regla "el equipo no cruza edificios" incluso en el flujo de reemplazo.';



CREATE OR REPLACE FUNCTION "operations"."equipment_validate_status_transition"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.status is distinct from old.status then
    if old.status = 'dead' then
      raise exception 'equipment.status transitions out of dead are forbidden (id %)', old.id
        using errcode = 'check_violation';
    end if;
    if not (
      (old.status = 'active'      and new.status in ('maintenance','dead'))
      or (old.status = 'maintenance' and new.status in ('active','dead'))
    ) then
      raise exception 'invalid equipment.status transition: % -> % (id %)',
        old.status, new.status, old.id
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "operations"."equipment_validate_status_transition"() OWNER TO "postgres";


COMMENT ON FUNCTION "operations"."equipment_validate_status_transition"() IS 'Trigger BEFORE UPDATE OF status: enforce la máquina de estados active ↔ maintenance, ambos → dead. dead es terminal (transiciones fuera de dead están prohibidas).';



CREATE OR REPLACE FUNCTION "operations"."key_authorizations_prevent_reassignment"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.rfid_key_id is distinct from old.rfid_key_id then
    raise exception 'key_authorizations.rfid_key_id is immutable (id %)', old.id
      using errcode = 'check_violation';
  end if;
  if new.equipment_id is distinct from old.equipment_id then
    raise exception 'key_authorizations.equipment_id is immutable (id %)', old.id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "operations"."key_authorizations_prevent_reassignment"() OWNER TO "postgres";


COMMENT ON FUNCTION "operations"."key_authorizations_prevent_reassignment"() IS 'Trigger BEFORE UPDATE: bloquea cambios a rfid_key_id y equipment_id. Una autorización es un hecho histórico; para migrar una llave a otro equipo se crea otra autorización, no se muta la existente.';



CREATE OR REPLACE FUNCTION "operations"."key_authorizations_sync_timestamps"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if tg_op = 'UPDATE' and new.sync_state is distinct from old.sync_state then
    if new.sync_state = 'installed' and new.installed_at is null then
      new.installed_at := now();
    end if;
    if new.sync_state = 'removed' and new.removed_at is null then
      new.removed_at := now();
    end if;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "operations"."key_authorizations_sync_timestamps"() OWNER TO "postgres";


COMMENT ON FUNCTION "operations"."key_authorizations_sync_timestamps"() IS 'Trigger BEFORE UPDATE: autofilla installed_at cuando sync_state pasa a installed, y removed_at cuando pasa a removed.';



CREATE OR REPLACE FUNCTION "operations"."key_authorizations_validate"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'public', 'support', 'operations', 'sales', 'identity'
    AS $$
declare
  key_status         text;
  key_building_id    uuid;
  equip_status       text;
  equip_building_id  uuid;
begin
  if tg_op = 'INSERT' then
    select k.status, u.building_id
      into key_status, key_building_id
      from public.rfid_keys k
      join public.units u on u.id = k.unit_id
     where k.id = new.rfid_key_id;

    select status, building_id
      into equip_status, equip_building_id
      from operations.equipment
     where id = new.equipment_id;

    if key_status <> 'active' then
      raise exception
        'cannot authorize an rfid_key with status=% (only active keys can be authorized)',
        key_status
        using errcode = 'check_violation';
    end if;
    if equip_status = 'dead' then
      raise exception
        'cannot authorize on equipment with status=dead'
        using errcode = 'check_violation';
    end if;
    if key_building_id <> equip_building_id then
      raise exception
        'key and equipment must belong to the same building (key: %, equipment: %)',
        key_building_id, equip_building_id
        using errcode = 'check_violation';
    end if;

    new.sync_state := 'pending_install';
    return new;
  end if;

  if new.sync_state is distinct from old.sync_state then
    if not (
      (old.sync_state = 'pending_install' and new.sync_state = 'installed')
      or (old.sync_state = 'pending_install' and new.sync_state = 'removed')
      or (old.sync_state = 'pending_install' and new.sync_state = 'cancelled')
      or (old.sync_state = 'installed'       and new.sync_state = 'pending_removal')
      or (old.sync_state = 'pending_removal' and new.sync_state = 'removed')
      or (old.sync_state = 'pending_removal' and new.sync_state = 'cancelled')
      -- Admin-only reversal: key reactivated before the removal visit.
      or (old.sync_state = 'pending_removal' and new.sync_state = 'installed'
          and coalesce(current_setting('app.allow_removal_reversal', true), 'false') = 'true')
    ) then
      raise exception
        'invalid sync_state transition: % -> %', old.sync_state, new.sync_state
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "operations"."key_authorizations_validate"() OWNER TO "postgres";


COMMENT ON FUNCTION "operations"."key_authorizations_validate"() IS 'Trigger BEFORE INSERT/UPDATE: en INSERT valida que la llave sea active, el equipo no sea dead, y que ambos estén en el mismo edificio; fuerza sync_state=pending_install al arrancar. En UPDATE valida transiciones legales de sync_state.';



CREATE OR REPLACE FUNCTION "operations"."replace_equipment"("p_old_equipment_id" "uuid", "p_new_serial_number" "text", "p_new_model" "text", "p_new_description" "text", "p_new_access_type" "text" DEFAULT NULL::"text", "p_decommission_reason" "text" DEFAULT 'Replaced by new equipment'::"text", "p_replacement_staff_id" "uuid" DEFAULT NULL::"uuid", "p_activate_keys_directly" boolean DEFAULT false) RETURNS "uuid"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_building_id uuid;
  v_old_status  text;
  v_new_id      uuid;
begin
  select building_id, status
    into v_building_id, v_old_status
    from operations.equipment
   where id = p_old_equipment_id
   for update;

  if not found then
    raise exception 'equipment % not found', p_old_equipment_id;
  end if;
  if v_old_status = 'dead' then
    raise exception 'equipment % is already dead', p_old_equipment_id;
  end if;

  -- Snapshot installed keys BEFORE the status flip. Once status becomes dead,
  -- equipment_close_authorizations_on_dead transitions them out of 'installed'
  -- and this SELECT would return zero rows.
  create temp table if not exists _keys_to_migrate (rfid_key_id uuid) on commit drop;
  truncate _keys_to_migrate;
  insert into _keys_to_migrate (rfid_key_id)
  select rfid_key_id
    from operations.key_authorizations
   where equipment_id = p_old_equipment_id
     and sync_state   = 'installed';

  -- 1) Kill the old device. Trigger closes old authorizations automatically.
  update operations.equipment
     set status              = 'dead',
         decommission_reason = p_decommission_reason
   where id = p_old_equipment_id;

  -- 2) Create the replacement.
  insert into operations.equipment (
    serial_number, model, building_id, description, access_type,
    status, replaces_equipment_id
  ) values (
    p_new_serial_number, p_new_model, v_building_id, p_new_description,
    p_new_access_type, 'active', p_old_equipment_id
  )
  returning id into v_new_id;

  -- 3) Recreate authorizations on the new device (default sync_state
  --    pending_install, forced by key_authorizations_validate).
  insert into operations.key_authorizations (rfid_key_id, equipment_id, notes)
  select rfid_key_id,
         v_new_id,
         'Auto-created by replace_equipment(' || p_old_equipment_id || ')'
    from _keys_to_migrate;

  -- 4) Option B: caller physically installed the keys at the same visit —
  --    promote pending_install → installed atomically. Silent no-op otherwise.
  if p_activate_keys_directly then
    update operations.key_authorizations
       set sync_state          = 'installed',
           installed_by_staff_id = coalesce(installed_by_staff_id, p_replacement_staff_id)
     where equipment_id = v_new_id
       and sync_state   = 'pending_install';
  end if;

  return v_new_id;
end;
$$;


ALTER FUNCTION "operations"."replace_equipment"("p_old_equipment_id" "uuid", "p_new_serial_number" "text", "p_new_model" "text", "p_new_description" "text", "p_new_access_type" "text", "p_decommission_reason" "text", "p_replacement_staff_id" "uuid", "p_activate_keys_directly" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "operations"."revoke_key_from_all_equipment"("p_rfid_key_id" "uuid", "p_reason" "text" DEFAULT 'Key revoked'::"text") RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
declare
  v_count integer;
begin
  update operations.key_authorizations
     set sync_state = 'pending_removal'
   where rfid_key_id = p_rfid_key_id
     and sync_state  = 'installed';
  get diagnostics v_count = row_count;

  -- Cancel any authorizations that never got installed.
  update operations.key_authorizations
     set sync_state    = 'removed',
         remove_reason = p_reason
   where rfid_key_id = p_rfid_key_id
     and sync_state  = 'pending_install';

  return v_count;
end;
$$;


ALTER FUNCTION "operations"."revoke_key_from_all_equipment"("p_rfid_key_id" "uuid", "p_reason" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "operations"."revoke_key_from_all_equipment"("p_rfid_key_id" "uuid", "p_reason" "text") IS 'Marks all installed authorizations of a key as pending_removal and cancels any pending_installs. Returns the count of installed rows transitioned.';



CREATE OR REPLACE FUNCTION "public"."cancel_key_disable"("p_key_id" "uuid", "p_actor_staff_id" "uuid" DEFAULT NULL::"uuid", "p_note" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'identity'
    AS $$
declare
  v_status text;
  v_actor  uuid;
begin
  v_actor := coalesce(p_actor_staff_id, identity.current_staff_id());

  select status into v_status
    from public.rfid_keys
   where id = p_key_id
   for update;

  if v_status is null then
    raise exception 'cancel_key_disable: key % not found', p_key_id
      using errcode = 'P0001';
  end if;

  -- Idempotent no-op
  if v_status = 'active' then
    return;
  end if;

  if v_status <> 'pending_disable' then
    raise exception 'cancel_key_disable: key % must be pending_disable to cancel (current status: %)',
      p_key_id, v_status
      using errcode = 'P0001';
  end if;

  update public.rfid_keys set status = 'active' where id = p_key_id;

  insert into public.key_events (key_id, event_type, note, actor_staff_id)
    values (
      p_key_id,
      'disable_cancelled',
      coalesce(p_note, 'Solicitud de baja cancelada'),
      v_actor
    );
end;
$$;


ALTER FUNCTION "public"."cancel_key_disable"("p_key_id" "uuid", "p_actor_staff_id" "uuid", "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_key_order"("p_order_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_order record;
begin
  -- Row-lock and read.
  select id, status
    into v_order
    from public.key_orders
   where id = p_order_id
   for update;

  if not found then
    raise exception 'KEY_ORDER_NOT_FOUND: key order % does not exist', p_order_id
      using errcode = 'P0001';
  end if;

  -- Reject if already in a terminal state.
  if v_order.status in ('completed', 'invoiced', 'cancelled') then
    raise exception 'KEY_ORDER_TERMINAL_STATE: key order % is in terminal state (current: %)',
      p_order_id, v_order.status
      using errcode = 'P0001';
  end if;

  -- Update status to 'cancelled'.
  -- The key_orders_cancel_release_reservations trigger fires here and handles:
  --   * stock movement liberacion rows
  --   * key_order_items status → 'cancelled'
  --   * rfid_keys order_item_id nullification
  update public.key_orders
     set status = 'cancelled'
   where id = p_order_id;
end;
$$;


ALTER FUNCTION "public"."cancel_key_order"("p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_technical_order"("p_order_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'support', 'extensions'
    AS $$
declare
  v_order        record;
  v_all_resolved boolean;
begin
  -- Row-lock and read.
  select id, status
    into v_order
    from public.technical_orders
   where id = p_order_id
   for update;

  if not found then
    raise exception 'TECHNICAL_ORDER_NOT_FOUND: technical order % does not exist', p_order_id
      using errcode = 'P0001';
  end if;

  -- Reject if already in a terminal state.
  if v_order.status in ('completed', 'invoiced', 'cancelled') then
    raise exception 'TECHNICAL_ORDER_TERMINAL_STATE: technical order % is in terminal state (current: %)',
      p_order_id, v_order.status
      using errcode = 'P0001';
  end if;

  -- Reject if all non-cancelled tickets are resolved (order is effectively done).
  select (
    count(*) filter (where t.status not in ('cancelled', 'resolved')) = 0
    and count(*) filter (where t.status = 'resolved') > 0
  )
  into v_all_resolved
  from support.tickets t
  join public.technical_order_items toi on toi.id = t.technical_order_item_id
  where toi.order_id = p_order_id
    and t.status not in ('cancelled');

  if v_all_resolved then
    raise exception 'TECHNICAL_ORDER_ALL_RESOLVED: cannot cancel technical order % — all tickets are already resolved',
      p_order_id
      using errcode = 'P0001';
  end if;

  -- Update status → 'cancelled'.
  -- The technical_orders_cancel_release_reservations trigger fires here and handles:
  --   * stock movement liberacion rows
  --   * support.tickets status → 'cancelled' (with cancellation_reason)
  --   * technical_order_items status → 'cancelled'
  update public.technical_orders
     set status = 'cancelled'
   where id = p_order_id;
end;
$$;


ALTER FUNCTION "public"."cancel_technical_order"("p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."change_key_status"("p_key_id" "uuid", "p_status" "text", "p_note" "text" DEFAULT NULL::"text", "p_actor_staff_id" "uuid" DEFAULT NULL::"uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_current_status text;
  v_trimmed_note   text;
begin
  select status into v_current_status
    from public.rfid_keys
   where id = p_key_id;

  if not found then
    raise exception 'change_key_status: key % not found', p_key_id
      using errcode = 'P0001';
  end if;

  if p_status not in ('active', 'disabled') then
    raise exception 'change_key_status: invalid status %', p_status
      using errcode = 'P0001';
  end if;

  -- Idempotent no-op.
  if p_status = v_current_status then
    return;
  end if;

  v_trimmed_note := nullif(trim(coalesce(p_note, '')), '');

  if p_status = 'disabled' then
    -- Queue physical removal on every equipment still holding the key and
    -- cancel installs that never made it to the device.
    perform operations.revoke_key_from_all_equipment(
      p_key_id,
      coalesce(v_trimmed_note, 'Key disabled')
    );
  else
    -- Reactivation: the key is still physically loaded; cancel pending
    -- removals. Transaction-local flag scopes the reversal to this RPC.
    perform set_config('app.allow_removal_reversal', 'true', true);
    update operations.key_authorizations
       set sync_state    = 'installed',
           remove_reason = null
     where rfid_key_id = p_key_id
       and sync_state  = 'pending_removal';
  end if;

  update public.rfid_keys
     set status = p_status
   where id = p_key_id;

  insert into public.key_events (key_id, event_type, note, actor_staff_id)
  values (
    p_key_id,
    case when p_status = 'active' then 'activated' else 'deactivated' end,
    v_trimmed_note,
    p_actor_staff_id
  );
end;
$$;


ALTER FUNCTION "public"."change_key_status"("p_key_id" "uuid", "p_status" "text", "p_note" "text", "p_actor_staff_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_authorizations"("p_install_ids" "uuid"[], "p_remove_ids" "uuid"[], "p_staff_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_expected int;
  v_actual   int;
begin
  if coalesce(array_length(p_install_ids, 1), 0) > 0 then
    v_expected := array_length(p_install_ids, 1);
    update operations.key_authorizations
       set sync_state           = 'installed',
           installed_by_staff_id = p_staff_id
     where id = any(p_install_ids)
       and sync_state = 'pending_install';
    get diagnostics v_actual = row_count;
    if v_actual <> v_expected then
      raise exception 'complete_authorizations: install batch mismatch (expected %, got %)',
        v_expected, v_actual using errcode = 'P0001';
    end if;
  end if;

  if coalesce(array_length(p_remove_ids, 1), 0) > 0 then
    v_expected := array_length(p_remove_ids, 1);
    update operations.key_authorizations
       set sync_state         = 'removed',
           removed_by_staff_id = p_staff_id
     where id = any(p_remove_ids)
       and sync_state = 'pending_removal';
    get diagnostics v_actual = row_count;
    if v_actual <> v_expected then
      raise exception 'complete_authorizations: remove batch mismatch (expected %, got %)',
        v_expected, v_actual using errcode = 'P0001';
    end if;
  end if;
end;
$$;


ALTER FUNCTION "public"."complete_authorizations"("p_install_ids" "uuid"[], "p_remove_ids" "uuid"[], "p_staff_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."configure_key_order_item"("p_order_item_id" "uuid", "p_rfid_code" "text", "p_unit_id" "uuid", "p_equipment_ids" "uuid"[]) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'support', 'operations', 'identity', 'extensions'
    AS $$
declare
  v_key_id        uuid;
  v_item_status   text;
  v_existing_key  uuid;
  v_product_id    uuid;
  v_quantity      int;
  v_order_id      uuid;
  v_ticket_id     uuid;
  v_eq_id         uuid;
  v_actor         uuid;
begin
  v_actor := identity.current_staff_id();

  -- Try key_order_items first.
  select status, produced_key_id, product_id, quantity, order_id
    into v_item_status, v_existing_key, v_product_id, v_quantity, v_order_id
    from public.key_order_items
   where id = p_order_item_id;

  if v_item_status is null then
    -- Fall back to legacy order_items for the transition period (PR-1 through PR-3).
    -- This allows existing in-flight orders on the old schema to still be configured.
    select status, produced_key_id, product_id, quantity, order_id
      into v_item_status, v_existing_key, v_product_id, v_quantity, v_order_id
      from public.order_items
     where id = p_order_item_id;

    if v_item_status is null then
      raise exception 'configure_key: order item % not found in key_order_items or order_items', p_order_item_id
        using errcode = 'P0001';
    end if;

    -- Delegate to the legacy path for backward compat (call the old body logic inline).
    -- Idempotent no-op: already configured -> return the minted key.
    if v_item_status = 'configured' then
      if v_existing_key is null then
        raise exception 'configure_key: order item % is configured but has no produced key (inconsistent state)',
          p_order_item_id
          using errcode = 'P0001';
      end if;
      return v_existing_key;
    end if;

    if v_item_status <> 'pending' then
      raise exception 'configure_key: order item % is not pending (current status: %)',
        p_order_item_id, v_item_status
        using errcode = 'P0001';
    end if;

    insert into public.rfid_keys (rfid_code, unit_id, order_item_id, status)
      values (p_rfid_code, p_unit_id, p_order_item_id, 'pending_creation')
      returning id into v_key_id;

    insert into public.key_events (key_id, event_type, note)
      values (v_key_id, 'creation_requested', 'Llave creada para order_item ' || p_order_item_id);

    update public.order_items
       set produced_key_id = v_key_id, status = 'configured'
     where id = p_order_item_id;

    if p_equipment_ids is not null then
      foreach v_eq_id in array p_equipment_ids loop
        insert into public.rfid_key_intended_equipment (rfid_key_id, equipment_id)
          values (v_key_id, v_eq_id)
          on conflict do nothing;
      end loop;
    end if;

    if v_product_id is not null then
      select m.ticket_id into v_ticket_id
        from public.stock_movements m
       where m.order_item_id = p_order_item_id and m.type = 'reserva'
       limit 1;

      insert into public.stock_movements (product_id, type, quantity, note, order_id, order_item_id, ticket_id, created_by)
        values (v_product_id, 'egreso_grabacion', -v_quantity,
                'Egreso por configuración de llave (order_item ' || p_order_item_id || ')',
                v_order_id, p_order_item_id, v_ticket_id, v_actor);

      insert into public.stock_movements (product_id, type, quantity, note, order_id, order_item_id, ticket_id, created_by)
        values (v_product_id, 'liberacion_reserva', v_quantity,
                'Liberación de reserva al configurar llave (order_item ' || p_order_item_id || ')',
                v_order_id, p_order_item_id, v_ticket_id, v_actor);

      if v_ticket_id is not null then
        update support.tickets set status = 'in_progress' where id = v_ticket_id and status = 'open';
        update support.tickets
           set status = 'resolved',
               resolved_by_staff_id = v_actor,
               resolution_notes = 'Llave configurada (order_item ' || p_order_item_id || ')'
         where id = v_ticket_id and status = 'in_progress';
      end if;
    end if;

    update public.rfid_keys set status = 'pending_installation' where id = v_key_id;
    insert into public.key_events (key_id, event_type, note)
      values (v_key_id, 'configured', 'Llave programada, lista para instalación en equipo');

    return v_key_id;
  end if;

  -- ----------------------------------------------------------------
  -- New path: key_order_items
  -- ----------------------------------------------------------------

  -- Idempotent no-op: already configured → return the minted key.
  if v_item_status = 'configured' then
    if v_existing_key is null then
      raise exception 'configure_key: key_order_item % is configured but has no produced key (inconsistent state)',
        p_order_item_id
        using errcode = 'P0001';
    end if;
    return v_existing_key;
  end if;

  if v_item_status <> 'pending' then
    raise exception 'configure_key: key_order_item % is not pending (current status: %)',
      p_order_item_id, v_item_status
      using errcode = 'P0001';
  end if;

  -- Mint the RFID key as pending_creation.
  -- Note: rfid_keys.order_item_id still exists (references the legacy order_items FK);
  -- for key_order_items we track via key_order_items.produced_key_id instead.
  -- We do NOT set rfid_keys.order_item_id here since it FKs to the legacy table.
  insert into public.rfid_keys (rfid_code, unit_id, status)
    values (p_rfid_code, p_unit_id, 'pending_creation')
    returning id into v_key_id;

  -- Emit creation_requested event.
  insert into public.key_events (key_id, event_type, note)
    values (v_key_id, 'creation_requested', 'Llave creada para key_order_item ' || p_order_item_id);

  -- Link key to the new item and mark as configured.
  -- This triggers key_order_items_recompute_order_status_trigger.
  update public.key_order_items
     set produced_key_id = v_key_id,
         unit_id         = coalesce(p_unit_id, unit_id),
         status          = 'configured'
   where id = p_order_item_id;

  -- Populate intended equipment junction.
  if p_equipment_ids is not null then
    foreach v_eq_id in array p_equipment_ids loop
      insert into public.rfid_key_intended_equipment (rfid_key_id, equipment_id)
        values (v_key_id, v_eq_id)
        on conflict do nothing;
    end loop;
  end if;

  -- Stock side-effects: only when the item references an inventory SKU.
  if v_product_id is not null then
    -- Locate the reserva movement created at confirm time.
    select sm.ticket_id into v_ticket_id
      from public.stock_movements sm
     where sm.order_item_id = p_order_item_id
       and sm.order_kind = 'key'
       and sm.type = 'reserva'
     limit 1;

    -- Definitive egress movement.
    insert into public.stock_movements (
      product_id, type, quantity, note, order_id, order_item_id, order_kind, created_by
    )
    values (
      v_product_id, 'egreso_grabacion', -v_quantity,
      'Egreso por configuración de llave (key_order_item ' || p_order_item_id || ')',
      v_order_id, p_order_item_id, 'key', v_actor
    );

    -- Release the reservation.
    insert into public.stock_movements (
      product_id, type, quantity, note, order_id, order_item_id, order_kind, created_by
    )
    values (
      v_product_id, 'liberacion_reserva', v_quantity,
      'Liberación de reserva al configurar llave (key_order_item ' || p_order_item_id || ')',
      v_order_id, p_order_item_id, 'key', v_actor
    );
  end if;

  -- Advance key to pending_installation and emit 'configured' event.
  update public.rfid_keys set status = 'pending_installation' where id = v_key_id;

  insert into public.key_events (key_id, event_type, note)
    values (v_key_id, 'configured', 'Llave programada, lista para instalación en equipo');

  return v_key_id;
end;
$$;


ALTER FUNCTION "public"."configure_key_order_item"("p_order_item_id" "uuid", "p_rfid_code" "text", "p_unit_id" "uuid", "p_equipment_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."configure_technical_ticket_equipment"("p_ticket_id" "uuid", "p_new_serial" "text", "p_new_model" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'support', 'extensions'
    AS $$
declare
  v_category                text;
  v_status                  text;
  v_technical_order_item_id uuid;
  v_effective_model         text;
  v_product_name            text;
begin
  if p_new_serial is null or length(trim(p_new_serial)) = 0 then
    raise exception 'configure_technical_ticket_equipment: new serial is required'
      using errcode = 'P0001';
  end if;

  select category, status, technical_order_item_id
    into v_category, v_status, v_technical_order_item_id
    from support.tickets
   where id = p_ticket_id
   for update;

  if v_category is null then
    raise exception 'configure_technical_ticket_equipment: ticket % not found', p_ticket_id
      using errcode = 'P0001';
  end if;

  if v_category not in ('equipment_installation', 'equipment_replacement') then
    raise exception
      'configure_technical_ticket_equipment: ticket % category=% is not configurable (only equipment_installation and equipment_replacement)',
      p_ticket_id, v_category
      using errcode = 'P0001';
  end if;

  if v_status not in ('open', 'in_progress') then
    raise exception
      'configure_technical_ticket_equipment: ticket % is not open/in_progress (current: %)',
      p_ticket_id, v_status
      using errcode = 'P0001';
  end if;

  -- Resolve effective model: caller wins, else product name from linked order item.
  v_effective_model := nullif(trim(coalesce(p_new_model, '')), '');
  if v_effective_model is null and v_technical_order_item_id is not null then
    select p.name
      into v_product_name
      from public.technical_order_items toi
      left join public.products p on p.id = toi.product_id
     where toi.id = v_technical_order_item_id;
    v_effective_model := v_product_name;
  end if;

  update support.tickets
     set pending_new_serial = trim(p_new_serial),
         pending_new_model  = v_effective_model
   where id = p_ticket_id;

  -- Transition open → in_progress if needed (idempotent when already in_progress).
  update support.tickets
     set status = 'in_progress'
   where id = p_ticket_id
     and status = 'open';
end;
$$;


ALTER FUNCTION "public"."configure_technical_ticket_equipment"("p_ticket_id" "uuid", "p_new_serial" "text", "p_new_model" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."configure_technical_ticket_equipment"("p_ticket_id" "uuid", "p_new_serial" "text", "p_new_model" "text") IS 'Step 1 of the two-step equipment task flow. Writes the operator-supplied serial (and optional model) into the ticket and transitions it to in_progress. No side effects on equipment, stock, or authorizations — those run at finalize time via resolve_ticket.';



CREATE OR REPLACE FUNCTION "public"."confirm_key_order"("p_order_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'support', 'extensions'
    AS $$
declare
  v_order      record;
  v_item       record;
  v_item_count int;
begin
  -- 1. Row-lock and read current state.
  select id, status
    into v_order
    from public.key_orders
   where id = p_order_id
   for update;

  if not found then
    raise exception 'KEY_ORDER_NOT_FOUND: key order % does not exist', p_order_id
      using errcode = 'P0001';
  end if;

  -- 2. Validate status = 'draft'.
  if v_order.status <> 'draft' then
    raise exception 'KEY_ORDER_NOT_DRAFT: key order % is not in draft status (current: %)',
      p_order_id, v_order.status
      using errcode = 'P0001';
  end if;

  -- 3. Validate at least one non-cancelled item.
  select count(*) into v_item_count
    from public.key_order_items
   where order_id = p_order_id
     and status <> 'cancelled';

  if v_item_count = 0 then
    raise exception 'KEY_ORDER_EMPTY: key order % has no active items', p_order_id
      using errcode = 'P0001';
  end if;

  -- 4. Transition order to 'confirmed'.
  update public.key_orders
     set status = 'confirmed'
   where id = p_order_id;

  -- 5. Per-item stock reservations (key orders: reserva only, no tickets).
  --    Only items with a product_id participate in stock movements.
  for v_item in
    select id, product_id, quantity
      from public.key_order_items
     where order_id = p_order_id
       and status <> 'cancelled'
       and product_id is not null
  loop
    insert into public.stock_movements (
      product_id,
      type,
      quantity,
      note,
      order_id,
      order_item_id,
      order_kind
    )
    values (
      v_item.product_id,
      'reserva',
      -v_item.quantity,
      'Reserva de stock desde key_order_item ' || v_item.id::text,
      p_order_id,
      v_item.id,
      'key'
    )
    on conflict (order_item_id, type)
      where type = 'reserva' and order_item_id is not null
      do nothing;
  end loop;
end;
$$;


ALTER FUNCTION "public"."confirm_key_order"("p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."confirm_technical_order"("p_order_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'support', 'extensions'
    AS $$
declare
  v_order        record;
  v_item         record;
  v_item_count   int;
  v_category     text;
  v_admin_id     uuid;
  v_product_cat  text;
begin
  select id, status, administration_id
    into v_order
    from public.technical_orders
   where id = p_order_id
   for update;

  if not found then
    raise exception 'TECHNICAL_ORDER_NOT_FOUND: technical order % does not exist', p_order_id
      using errcode = 'P0001';
  end if;

  if v_order.status <> 'draft' then
    raise exception 'TECHNICAL_ORDER_NOT_DRAFT: technical order % is not in draft status (current: %)',
      p_order_id, v_order.status
      using errcode = 'P0001';
  end if;

  select count(*) into v_item_count
    from public.technical_order_items
   where order_id = p_order_id
     and status <> 'cancelled';

  if v_item_count = 0 then
    raise exception 'TECHNICAL_ORDER_EMPTY: technical order % has no active items', p_order_id
      using errcode = 'P0001';
  end if;

  for v_item in
    select id, item_type, product_id, intended_equipment_id,
           intended_replacement_equipment_id,
           intended_assignee_staff_id, building_id
      from public.technical_order_items
     where order_id = p_order_id
       and status <> 'cancelled'
  loop
    if v_item.intended_assignee_staff_id is null then
      raise exception 'TECHNICAL_ORDER_INTENT_REQUIRED: intended_assignee_staff_id required to confirm (order_id=%, item_id=%, item_type=%)',
        p_order_id, v_item.id, v_item.item_type
        using errcode = 'P0001';
    end if;

    if v_item.item_type in ('maintenance', 'equipment_replacement')
       and v_item.intended_equipment_id is null then
      raise exception 'TECHNICAL_ORDER_INTENT_REQUIRED: intended_equipment_id required for item_type=% (order_id=%, item_id=%)',
        v_item.item_type, p_order_id, v_item.id
        using errcode = 'P0001';
    end if;

    if v_item.item_type in ('equipment', 'equipment_replacement')
       and v_item.product_id is null then
      raise exception 'TECHNICAL_ORDER_PRODUCT_REQUIRED: product_id required for item_type=% (order_id=%, item_id=%)',
        v_item.item_type, p_order_id, v_item.id
        using errcode = 'P0001';
    end if;

    if v_item.product_id is not null then
      select category into v_product_cat
        from public.products
       where id = v_item.product_id;

      if v_item.item_type in ('equipment', 'equipment_replacement')
         and v_product_cat <> 'equipment' then
        raise exception 'TECHNICAL_ORDER_PRODUCT_CATEGORY_MISMATCH: product % has category % but item_type=% requires equipment',
          v_item.product_id, v_product_cat, v_item.item_type
          using errcode = 'P0001';
      end if;
    end if;
  end loop;

  update public.technical_orders
     set status = 'confirmed'
   where id = p_order_id;

  for v_item in
    select id, item_type, product_id, intended_equipment_id,
           intended_replacement_equipment_id,
           intended_assignee_staff_id, quantity, description, building_id
      from public.technical_order_items
     where order_id = p_order_id
       and status <> 'cancelled'
  loop
    v_category := case v_item.item_type
                    when 'installation'          then 'installation'
                    when 'equipment_replacement' then 'equipment_replacement'
                    when 'maintenance'           then 'maintenance'
                    when 'equipment'             then 'equipment_installation'
                    else null
                  end;

    select b.administration_id
      into v_admin_id
      from public.buildings b
     where b.id = v_item.building_id;

    if v_admin_id is null then
      raise exception 'TECHNICAL_ORDER_BUILDING_NOT_FOUND: building % not found for item % (order_id=%)',
        v_item.building_id, v_item.id, p_order_id
        using errcode = 'P0001';
    end if;

    insert into support.tickets (
      administration_id,
      building_id,
      equipment_id,
      assigned_to_staff_id,
      category,
      description,
      status,
      notes,
      technical_order_item_id
    )
    values (
      v_admin_id,
      v_item.building_id,
      v_item.intended_equipment_id,
      v_item.intended_assignee_staff_id,
      v_category,
      coalesce(
        nullif(trim(v_item.description), ''),
        'Item de orden técnica (' || v_item.item_type || ')'
      ),
      'open',
      'Generado automáticamente desde technical_order_item ' || v_item.id::text,
      v_item.id
    );

    if v_item.product_id is not null then
      insert into public.stock_movements (
        product_id,
        type,
        quantity,
        note,
        order_id,
        order_item_id,
        order_kind
      )
      values (
        v_item.product_id,
        'reserva',
        -v_item.quantity,
        'Reserva de stock desde technical_order_item ' || v_item.id::text,
        p_order_id,
        v_item.id,
        'technical'
      )
      on conflict (order_item_id, type)
        where type = 'reserva' and order_item_id is not null
        do nothing;
    end if;
  end loop;
end;
$$;


ALTER FUNCTION "public"."confirm_technical_order"("p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_and_assign_equipment"("p_ticket_id" "uuid", "p_building_id" "uuid", "p_serial" "text", "p_model" "text", "p_description" "text", "p_access_type" "text") RETURNS "uuid"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_equipment_id uuid;
  v_updated int;
begin
  insert into operations.equipment (
    building_id,
    serial_number,
    model,
    description,
    access_type
  ) values (
    p_building_id,
    p_serial,
    p_model,
    coalesce(p_description, ''),
    p_access_type
  )
  returning id into v_equipment_id;

  update support.tickets
     set equipment_id = v_equipment_id
   where id = p_ticket_id;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'create_and_assign_equipment: ticket % not found', p_ticket_id
      using errcode = 'P0001';
  end if;

  return v_equipment_id;
end;
$$;


ALTER FUNCTION "public"."create_and_assign_equipment"("p_ticket_id" "uuid", "p_building_id" "uuid", "p_serial" "text", "p_model" "text", "p_description" "text", "p_access_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_equipment_update"("p_equipment_id" "uuid", "p_administration_id" "uuid", "p_building_id" "uuid", "p_description" "text", "p_mdb_storage_path" "text", "p_keys_to_activate" "uuid"[] DEFAULT '{}'::"uuid"[], "p_keys_to_disable" "uuid"[] DEFAULT '{}'::"uuid"[], "p_actor_staff_id" "uuid" DEFAULT NULL::"uuid", "p_assigned_to_staff_id" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'support', 'identity'
    AS $$
declare
  v_ticket_id  uuid;
  v_task_id    uuid;
  v_actor      uuid;
begin
  v_actor := coalesce(p_actor_staff_id, identity.current_staff_id());

  if cardinality(p_keys_to_activate) + cardinality(p_keys_to_disable) = 0 then
    raise exception 'create_equipment_update: snapshot must include at least one key'
      using errcode = 'P0001';
  end if;

  insert into support.tickets (
    administration_id,
    building_id,
    equipment_id,
    category,
    description,
    status,
    assigned_to_staff_id
  ) values (
    p_administration_id,
    p_building_id,
    p_equipment_id,
    'equipment_update',
    p_description,
    'open',
    p_assigned_to_staff_id
  ) returning id into v_ticket_id;

  insert into support.equipment_updates (
    ticket_id,
    equipment_id,
    mdb_storage_path,
    keys_to_activate,
    keys_to_disable,
    created_by_staff_id
  ) values (
    v_ticket_id,
    p_equipment_id,
    p_mdb_storage_path,
    p_keys_to_activate,
    p_keys_to_disable,
    v_actor
  ) returning id into v_task_id;

  return v_task_id;
end;
$$;


ALTER FUNCTION "public"."create_equipment_update"("p_equipment_id" "uuid", "p_administration_id" "uuid", "p_building_id" "uuid", "p_description" "text", "p_mdb_storage_path" "text", "p_keys_to_activate" "uuid"[], "p_keys_to_disable" "uuid"[], "p_actor_staff_id" "uuid", "p_assigned_to_staff_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_key_order_with_items"("p_order" "jsonb", "p_items" "jsonb"[], "p_confirm_immediately" boolean DEFAULT true) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'support', 'extensions'
    AS $$
declare
  v_order_id       uuid;
  v_client_type    text;
  v_particular_id  uuid;
  v_part_full_name text;
  v_part_dni       text;
  v_part_phone     text;
  v_part_email     text;
  v_item           jsonb;
  v_item_type      text;
  v_unit_price     numeric(12, 2);
  v_qty            int;
  v_key_idx        int;
begin
  -- ----------------------------------------------------------------
  -- 1. Client validation
  -- ----------------------------------------------------------------
  v_client_type := p_order->>'client_type';

  if v_client_type = 'administration' then
    if (p_order->>'administration_id') is null then
      raise exception 'KEY_ORDER_CLIENT_INCONSISTENT: administration_id required when client_type=administration'
        using errcode = 'P0001';
    end if;

  elsif v_client_type = 'particular' then
    v_particular_id := coalesce(
      (p_order->>'particular_id')::uuid,
      (select id from public.particulares where dni = p_order->>'particular_dni')
    );

    if v_particular_id is null then
      raise exception 'KEY_ORDER_CLIENT_INCONSISTENT: particular_id required when client_type=particular'
        using errcode = 'P0001';
    end if;

    select full_name, dni, phone, email
      into v_part_full_name, v_part_dni, v_part_phone, v_part_email
      from public.particulares
     where id = v_particular_id;

    if v_part_full_name is null then
      raise exception 'KEY_ORDER_CLIENT_INCONSISTENT: particular % not found', v_particular_id
        using errcode = 'P0001';
    end if;

  else
    raise exception 'KEY_ORDER_CLIENT_INCONSISTENT: invalid client_type %', v_client_type
      using errcode = 'P0001';
  end if;

  -- ----------------------------------------------------------------
  -- 2. Items pre-validation (all items before any INSERT)
  -- ----------------------------------------------------------------
  if p_items is null or array_length(p_items, 1) = 0 then
    raise exception 'KEY_ORDER_EMPTY: at least one item is required'
      using errcode = 'P0001';
  end if;

  foreach v_item in array p_items loop
    v_item_type := v_item->>'item_type';

    if v_item_type <> 'key' then
      raise exception 'KEY_ORDER_INVALID_ITEM_TYPE: key orders only accept item_type=key (got %)', v_item_type
        using errcode = 'P0001';
    end if;

    if (v_item->>'building_id') is null then
      raise exception 'KEY_ORDER_MISSING_BUILDING: building_id is required for key items'
        using errcode = 'P0001';
    end if;

    -- W-001 correction: unit_price > 0 required for ALL items at creation time.
    v_unit_price := nullif(v_item->>'unit_price', '')::numeric(12, 2);
    if v_unit_price is null or v_unit_price <= 0 then
      raise exception 'KEY_ORDER_PRICE_REQUIRED: unit_price > 0 is required for key items'
        using errcode = 'P0001';
    end if;

    v_qty := coalesce((v_item->>'quantity')::int, 1);
    if v_qty < 1 then
      raise exception 'KEY_ORDER_INVALID_QUANTITY: quantity must be >= 1'
        using errcode = 'P0001';
    end if;
  end loop;

  -- ----------------------------------------------------------------
  -- 3. Insert order header
  -- ----------------------------------------------------------------
  insert into public.key_orders (
    client_type,
    administration_id,
    particular_id,
    particular_full_name,
    particular_dni,
    particular_phone,
    particular_email,
    notes,
    status
  )
  values (
    v_client_type,
    (p_order->>'administration_id')::uuid,
    v_particular_id,
    coalesce(nullif(trim(p_order->>'particular_full_name'), ''), v_part_full_name),
    coalesce(nullif(trim(p_order->>'particular_dni'), ''), v_part_dni),
    coalesce(nullif(trim(p_order->>'particular_phone'), ''), v_part_phone),
    coalesce(nullif(trim(p_order->>'particular_email'), ''), v_part_email),
    p_order->>'notes',
    'draft'
  )
  returning id into v_order_id;

  -- ----------------------------------------------------------------
  -- 4. Insert items — explode quantity > 1 into N rows of quantity=1
  -- ----------------------------------------------------------------
  foreach v_item in array p_items loop
    v_qty := coalesce((v_item->>'quantity')::int, 1);

    for v_key_idx in 1..v_qty loop
      insert into public.key_order_items (
        order_id,
        item_type,
        quantity,
        description,
        building_id,
        product_id,
        unit_price,
        unit_id,
        pickup_particular_id,
        status
      )
      values (
        v_order_id,
        'key',
        1,
        v_item->>'description',
        (v_item->>'building_id')::uuid,
        (v_item->>'product_id')::uuid,
        nullif(v_item->>'unit_price', '')::numeric(12, 2),
        (v_item->>'unit_id')::uuid,
        (v_item->>'pickup_particular_id')::uuid,
        'pending'
      );
    end loop;
  end loop;

  -- ----------------------------------------------------------------
  -- 5. Optionally confirm inline
  -- ----------------------------------------------------------------
  if p_confirm_immediately then
    perform public.confirm_key_order(v_order_id);
  end if;

  return v_order_id;
end;
$$;


ALTER FUNCTION "public"."create_key_order_with_items"("p_order" "jsonb", "p_items" "jsonb"[], "p_confirm_immediately" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_product_with_initial_stock"("p_name" "text", "p_category" "text", "p_cost_price" numeric DEFAULT NULL::numeric, "p_quantity" integer DEFAULT 0, "p_note" "text" DEFAULT NULL::"text", "p_actor_staff_id" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'support', 'operations', 'sales', 'identity'
    AS $$
declare
  v_product_id  uuid;
  v_actor       uuid;
begin
  if not identity.is_admin() then
    raise exception 'create_product_with_initial_stock: admin role required'
      using errcode = 'insufficient_privilege';
  end if;

  v_actor := coalesce(p_actor_staff_id, identity.current_staff_id());

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'create_product_with_initial_stock: name is required'
      using errcode = 'P0001';
  end if;

  if p_category not in ('rfid_key', 'equipment') then
    raise exception
      'create_product_with_initial_stock: category % is invalid (rfid_key | equipment)',
      p_category
      using errcode = 'P0001';
  end if;

  if p_quantity < 0 then
    raise exception 'create_product_with_initial_stock: quantity must not be negative'
      using errcode = 'P0001';
  end if;

  -- Atomic insert: product + its initial compra movement in the same tx.
  insert into public.products (name, category, cost_price)
  values (trim(p_name), p_category, p_cost_price)
  returning id into v_product_id;

  if p_quantity > 0 then
    insert into public.stock_movements (
      product_id, type, quantity, unit_cost, note, created_by
    ) values (
      v_product_id,
      'compra',
      p_quantity,
      coalesce(p_cost_price, 0),
      coalesce(nullif(trim(coalesce(p_note, '')), ''),
               'Stock inicial (alta de producto)'),
      v_actor
    );
  end if;

  return v_product_id;
end;
$$;


ALTER FUNCTION "public"."create_product_with_initial_stock"("p_name" "text", "p_category" "text", "p_cost_price" numeric, "p_quantity" integer, "p_note" "text", "p_actor_staff_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_stock_movement"("p_product_id" "uuid", "p_type" "text", "p_quantity" integer, "p_unit_cost" numeric DEFAULT NULL::numeric, "p_note" "text" DEFAULT NULL::"text", "p_actor_staff_id" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'support', 'operations', 'sales', 'identity'
    AS $_$
declare
  v_movement_id uuid;
  v_actor       uuid;
  v_unit_cost   numeric;
begin
  if not identity.is_admin() then
    raise exception 'create_stock_movement: admin role required'
      using errcode = 'insufficient_privilege';
  end if;

  v_actor := coalesce(p_actor_staff_id, identity.current_staff_id());

  -- 0 en la UI significa "no registrar costo / no actualizar precio":
  -- lo normalizamos a NULL para que el ledger no muestre $0,00 falso.
  v_unit_cost := case
    when p_unit_cost is null then null
    when p_unit_cost <= 0    then null
    else p_unit_cost
  end;

  if p_type not in (
    'compra', 'devolucion', 'ajuste_manual', 'baja_defectuoso', 'baja_perdida'
  ) then
    raise exception 'create_stock_movement: type % is not a manual stock movement type', p_type
      using errcode = 'P0001';
  end if;

  if p_product_id is null then
    raise exception 'create_stock_movement: product is required'
      using errcode = 'P0001';
  end if;

  if p_quantity = 0 then
    raise exception 'create_stock_movement: quantity must not be zero'
      using errcode = 'P0001';
  end if;

  if p_type in ('compra', 'devolucion') and p_quantity < 0 then
    raise exception 'create_stock_movement: % requires a positive quantity', p_type
      using errcode = 'P0001';
  end if;

  if p_type in ('baja_defectuoso', 'baja_perdida') and p_quantity > 0 then
    raise exception 'create_stock_movement: % requires a negative quantity', p_type
      using errcode = 'P0001';
  end if;

  insert into public.stock_movements (
    product_id,
    type,
    quantity,
    unit_cost,
    note,
    created_by
  ) values (
    p_product_id,
    p_type,
    p_quantity,
    v_unit_cost,
    coalesce(nullif(trim(coalesce(p_note, '')), ''),
             'Movimiento manual (' || p_type || ')'),
    v_actor
  )
  returning id into v_movement_id;

  -- Sincronizar precio de costo del producto solo cuando la compra
  -- trae un costo positivo. NULL o 0 preservan el precio actual.
  if p_type = 'compra' and v_unit_cost is not null then
    update public.products
      set cost_price = v_unit_cost
      where id = p_product_id;
  end if;

  return v_movement_id;
end;
$_$;


ALTER FUNCTION "public"."create_stock_movement"("p_product_id" "uuid", "p_type" "text", "p_quantity" integer, "p_unit_cost" numeric, "p_note" "text", "p_actor_staff_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_technical_order_with_items"("p_order" "jsonb", "p_items" "jsonb"[], "p_confirm_immediately" boolean DEFAULT true) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'support', 'extensions'
    AS $$
declare
  v_order_id       uuid;
  v_client_type    text;
  v_particular_id  uuid;
  v_part_full_name text;
  v_part_dni       text;
  v_part_phone     text;
  v_part_email     text;
  v_item           jsonb;
  v_item_type      text;
  v_unit_price     numeric(12, 2);
  v_qty            int;
  v_building_id    uuid;
  v_product_id     uuid;
  v_product_cat    text;
begin
  v_client_type := p_order->>'client_type';

  if v_client_type = 'administration' then
    if (p_order->>'administration_id') is null then
      raise exception 'TECHNICAL_ORDER_CLIENT_INCONSISTENT: administration_id required when client_type=administration'
        using errcode = 'P0001';
    end if;

  elsif v_client_type = 'particular' then
    v_particular_id := coalesce(
      (p_order->>'particular_id')::uuid,
      (select id from public.particulares where dni = p_order->>'particular_dni')
    );

    if v_particular_id is null then
      raise exception 'TECHNICAL_ORDER_CLIENT_INCONSISTENT: particular_id required when client_type=particular'
        using errcode = 'P0001';
    end if;

    select full_name, dni, phone, email
      into v_part_full_name, v_part_dni, v_part_phone, v_part_email
      from public.particulares
     where id = v_particular_id;

    if v_part_full_name is null then
      raise exception 'TECHNICAL_ORDER_CLIENT_INCONSISTENT: particular % not found', v_particular_id
        using errcode = 'P0001';
    end if;

  else
    raise exception 'TECHNICAL_ORDER_CLIENT_INCONSISTENT: invalid client_type %', v_client_type
      using errcode = 'P0001';
  end if;

  if p_items is null or array_length(p_items, 1) = 0 then
    raise exception 'TECHNICAL_ORDER_EMPTY: at least one item is required'
      using errcode = 'P0001';
  end if;

  foreach v_item in array p_items loop
    v_item_type   := v_item->>'item_type';
    v_building_id := (v_item->>'building_id')::uuid;

    if v_building_id is null then
      raise exception 'TECHNICAL_ORDER_ITEM_BUILDING_REQUIRED: building_id is required for each item (item_type=%)', v_item_type
        using errcode = 'P0001';
    end if;

    if v_item_type not in ('equipment', 'maintenance', 'installation', 'equipment_replacement') then
      raise exception 'TECHNICAL_ORDER_INVALID_ITEM_TYPE: item_type must be one of equipment/maintenance/installation/equipment_replacement (got %)', v_item_type
        using errcode = 'P0001';
    end if;

    v_unit_price := nullif(v_item->>'unit_price', '')::numeric(12, 2);
    if v_unit_price is null or v_unit_price <= 0 then
      raise exception 'TECHNICAL_ORDER_PRICE_REQUIRED: unit_price > 0 is required for all items (item_type=%)', v_item_type
        using errcode = 'P0001';
    end if;

    v_qty := coalesce((v_item->>'quantity')::int, 1);
    if v_qty < 1 then
      raise exception 'TECHNICAL_ORDER_INVALID_QUANTITY: quantity must be >= 1'
        using errcode = 'P0001';
    end if;

    if p_confirm_immediately then
      if (v_item->>'intended_assignee_staff_id') is null then
        raise exception 'TECHNICAL_ORDER_INTENT_REQUIRED: intended_assignee_staff_id required for confirm (item_type=%)', v_item_type
          using errcode = 'P0001';
      end if;

      if v_item_type in ('maintenance', 'equipment_replacement')
         and (v_item->>'intended_equipment_id') is null then
        raise exception 'TECHNICAL_ORDER_INTENT_REQUIRED: intended_equipment_id required for confirm when item_type=% ', v_item_type
          using errcode = 'P0001';
      end if;

      -- product_id is required for equipment (installing new device) AND for
      -- equipment_replacement (picking the replacement unit from stock).
      if v_item_type in ('equipment', 'equipment_replacement')
         and (v_item->>'product_id') is null then
        raise exception 'TECHNICAL_ORDER_PRODUCT_REQUIRED: product_id required for item_type=%', v_item_type
          using errcode = 'P0001';
      end if;
    end if;

    -- Category coherence: whenever product_id is provided, its category must
    -- match the item_type family. Enforced at create-time even in draft mode
    -- so bad picks fail immediately.
    v_product_id := (v_item->>'product_id')::uuid;
    if v_product_id is not null then
      select category into v_product_cat
        from public.products
       where id = v_product_id;

      if v_product_cat is null then
        raise exception 'TECHNICAL_ORDER_PRODUCT_NOT_FOUND: product % not found', v_product_id
          using errcode = 'P0001';
      end if;

      if v_item_type in ('equipment', 'equipment_replacement')
         and v_product_cat <> 'equipment' then
        raise exception 'TECHNICAL_ORDER_PRODUCT_CATEGORY_MISMATCH: product % has category % but item_type=% requires equipment',
          v_product_id, v_product_cat, v_item_type
          using errcode = 'P0001';
      end if;
    end if;
  end loop;

  insert into public.technical_orders (
    client_type,
    administration_id,
    particular_id,
    particular_full_name,
    particular_dni,
    particular_phone,
    particular_email,
    notes,
    status
  )
  values (
    v_client_type,
    (p_order->>'administration_id')::uuid,
    v_particular_id,
    coalesce(nullif(trim(p_order->>'particular_full_name'), ''), v_part_full_name),
    coalesce(nullif(trim(p_order->>'particular_dni'), ''), v_part_dni),
    coalesce(nullif(trim(p_order->>'particular_phone'), ''), v_part_phone),
    coalesce(nullif(trim(p_order->>'particular_email'), ''), v_part_email),
    p_order->>'notes',
    'draft'
  )
  returning id into v_order_id;

  foreach v_item in array p_items loop
    insert into public.technical_order_items (
      order_id,
      item_type,
      quantity,
      description,
      unit_price,
      product_id,
      intended_equipment_id,
      intended_replacement_equipment_id,
      intended_assignee_staff_id,
      building_id,
      status
    )
    values (
      v_order_id,
      v_item->>'item_type',
      coalesce((v_item->>'quantity')::int, 1),
      v_item->>'description',
      nullif(v_item->>'unit_price', '')::numeric(12, 2),
      (v_item->>'product_id')::uuid,
      (v_item->>'intended_equipment_id')::uuid,
      (v_item->>'intended_replacement_equipment_id')::uuid,
      (v_item->>'intended_assignee_staff_id')::uuid,
      (v_item->>'building_id')::uuid,
      'pending'
    );
  end loop;

  if p_confirm_immediately then
    perform public.confirm_technical_order(v_order_id);
  end if;

  return v_order_id;
end;
$$;


ALTER FUNCTION "public"."create_technical_order_with_items"("p_order" "jsonb", "p_items" "jsonb"[], "p_confirm_immediately" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gen_key_order_number"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  return 'ORD-LLV-' || lpad(nextval('public.key_order_number_seq')::text, 6, '0');
end;
$$;


ALTER FUNCTION "public"."gen_key_order_number"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."gen_key_order_number"() IS 'Returns the next human-readable key-order number (ORD-LLV-XXXXXX).';



CREATE OR REPLACE FUNCTION "public"."gen_technical_order_number"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  return 'ORD-TEC-' || lpad(nextval('public.technical_order_number_seq')::text, 6, '0');
end;
$$;


ALTER FUNCTION "public"."gen_technical_order_number"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."gen_technical_order_number"() IS 'Returns the next human-readable technical-order number (ORD-TEC-XXXXXX).';



CREATE OR REPLACE FUNCTION "public"."key_order_items_recompute_order_status"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
begin
  perform public.recompute_key_order_status(new.order_id);
  return new;
end;
$$;


ALTER FUNCTION "public"."key_order_items_recompute_order_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."key_orders_cancel_release_reservations"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_movement record;
begin
  -- Only fires when transitioning INTO 'cancelled'.
  if new.status <> 'cancelled' or old.status = 'cancelled' then
    return new;
  end if;

  -- Release existing reservations by inserting opposing liberacion rows.
  for v_movement in
    select id, product_id, quantity, order_item_id
      from public.stock_movements
     where order_id = new.id
       and order_kind = 'key'
       and type = 'reserva'
  loop
    insert into public.stock_movements (
      product_id,
      type,
      quantity,
      note,
      order_id,
      order_item_id,
      order_kind
    )
    values (
      v_movement.product_id,
      'liberacion_reserva',
      -v_movement.quantity,   -- opposing sign to the reserva
      'Liberacion de reserva por cancelacion de key_order ' || new.id::text,
      new.id,
      v_movement.order_item_id,
      'key'
    );
  end loop;

  -- Cancel all non-terminal items.
  update public.key_order_items
     set status = 'cancelled'
   where order_id = new.id
     and status not in ('cancelled');

  -- Nullify produced_key_id references for any minted but not yet fully
  -- active keys (rfid_keys with status='pending_creation' or 'pending_installation').
  -- The keys themselves are left in place for audit; only the item link is cleared.
  update public.rfid_keys
     set order_item_id = null
   where order_item_id in (
     select id from public.key_order_items where order_id = new.id
   )
     and status in ('pending_creation', 'pending_installation');

  return new;
end;
$$;


ALTER FUNCTION "public"."key_orders_cancel_release_reservations"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_key_order_invoiced"("p_order_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_order record;
begin
  select id, status
    into v_order
    from public.key_orders
   where id = p_order_id
   for update;

  if not found then
    raise exception 'KEY_ORDER_NOT_FOUND: key order % does not exist', p_order_id
      using errcode = 'P0001';
  end if;

  if v_order.status <> 'completed' then
    raise exception 'KEY_ORDER_NOT_COMPLETED: key order % is not in completed status (current: %)',
      p_order_id, v_order.status
      using errcode = 'P0001';
  end if;

  update public.key_orders
     set status = 'invoiced'
   where id = p_order_id;
end;
$$;


ALTER FUNCTION "public"."mark_key_order_invoiced"("p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_key_order_item_installed"("p_order_item_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_status     text;
  v_key_id     uuid;
  v_key_status text;
begin
  -- Lock the item row.
  select status, produced_key_id
    into v_status, v_key_id
    from public.key_order_items
   where id = p_order_item_id
   for update;

  if not found then
    raise exception 'mark_key_order_item_installed: item % not found', p_order_item_id
      using errcode = 'P0001';
  end if;

  -- Idempotent no-op when already installed.
  if v_status = 'installed' then
    return;
  end if;

  if v_status <> 'configured' then
    raise exception 'mark_key_order_item_installed: item % is not configured (current: %)',
      p_order_item_id, v_status
      using errcode = 'P0001';
  end if;

  if v_key_id is null then
    raise exception 'mark_key_order_item_installed: item % has no produced key',
      p_order_item_id
      using errcode = 'P0001';
  end if;

  -- Advance the RFID key: pending_installation → active. If it was already
  -- active (e.g. via the resolve_equipment_* path), leave it alone.
  select status into v_key_status from public.rfid_keys where id = v_key_id for update;
  if v_key_status = 'pending_installation' then
    update public.rfid_keys set status = 'active' where id = v_key_id;
  end if;

  -- Audit event.
  insert into public.key_events (key_id, event_type, note)
    values (v_key_id, 'installed', 'Llave instalada en lector del edificio (key_order_item ' || p_order_item_id || ')');

  -- Advance the item; the AFTER UPDATE OF status trigger recomputes the order.
  update public.key_order_items
     set status = 'installed'
   where id = p_order_item_id;
end;
$$;


ALTER FUNCTION "public"."mark_key_order_item_installed"("p_order_item_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_technical_order_invoiced"("p_order_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_order record;
begin
  select id, status
    into v_order
    from public.technical_orders
   where id = p_order_id
   for update;

  if not found then
    raise exception 'TECHNICAL_ORDER_NOT_FOUND: technical order % does not exist', p_order_id
      using errcode = 'P0001';
  end if;

  if v_order.status <> 'completed' then
    raise exception 'TECHNICAL_ORDER_NOT_COMPLETED: technical order % is not in completed status (current: %)',
      p_order_id, v_order.status
      using errcode = 'P0001';
  end if;

  update public.technical_orders
     set status = 'invoiced'
   where id = p_order_id;
end;
$$;


ALTER FUNCTION "public"."mark_technical_order_invoiced"("p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recompute_key_order_status"("p_order_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_status      text;
  v_pending     int;
  v_configured  int;
  v_installed   int;
begin
  select status
    into v_status
    from public.key_orders
   where id = p_order_id;

  if not found then
    return;
  end if;

  -- Only drive the active lanes; terminal/draft never auto-transition.
  if v_status not in ('confirmed', 'in_progress', 'pending_installation', 'ready_for_pickup') then
    return;
  end if;

  select
    count(*) filter (where status = 'pending'),
    count(*) filter (where status = 'configured'),
    count(*) filter (where status = 'installed')
    into v_pending, v_configured, v_installed
    from public.key_order_items
   where order_id = p_order_id;

  -- No non-cancelled items → nothing to drive.
  if (v_pending + v_configured + v_installed) = 0 then
    return;
  end if;

  if v_pending > 0 and (v_configured > 0 or v_installed > 0) then
    -- Mixed: at least one advanced, some still pending.
    update public.key_orders
       set status = 'in_progress'
     where id = p_order_id
       and status in ('confirmed', 'pending_installation', 'ready_for_pickup');

  elsif v_pending > 0 then
    -- Nothing advanced yet.
    update public.key_orders
       set status = 'confirmed'
     where id = p_order_id
       and status in ('in_progress', 'pending_installation', 'ready_for_pickup');

  elsif v_configured > 0 then
    -- All non-cancelled items configured (some possibly also installed).
    update public.key_orders
       set status = 'pending_installation'
     where id = p_order_id
       and status in ('confirmed', 'in_progress', 'ready_for_pickup');

  else
    -- v_configured = 0 and v_installed > 0 → all installed.
    update public.key_orders
       set status = 'ready_for_pickup'
     where id = p_order_id
       and status in ('confirmed', 'in_progress', 'pending_installation');
  end if;
end;
$$;


ALTER FUNCTION "public"."recompute_key_order_status"("p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recompute_technical_order_status"("p_order_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'support', 'extensions'
    AS $$
declare
  v_order           record;
  v_total_tickets   int;
  v_resolved        int;
  v_in_progress     int;
  v_open            int;
begin
  -- Read current order state.
  select id, status
    into v_order
    from public.technical_orders
   where id = p_order_id;

  if not found then
    return;
  end if;

  -- Only drive state machine in the active range.
  if v_order.status not in ('confirmed', 'in_progress') then
    return;
  end if;

  -- Count tickets linked to non-cancelled items of this order.
  select
    count(*) filter (where t.status not in ('cancelled'))                           as total_tickets,
    count(*) filter (where t.status = 'resolved')                                   as resolved,
    count(*) filter (where t.status = 'in_progress')                                as in_progress,
    count(*) filter (where t.status = 'open')                                       as open
  into v_total_tickets, v_resolved, v_in_progress, v_open
  from support.tickets t
  join public.technical_order_items toi on toi.id = t.technical_order_item_id
  where toi.order_id = p_order_id
    and toi.status <> 'cancelled';

  -- No active tickets: nothing to drive (items without tickets are not counted).
  if v_total_tickets = 0 then
    return;
  end if;

  if v_resolved = v_total_tickets then
    -- All non-cancelled tickets resolved → completed.
    update public.technical_orders
       set status = 'completed'
     where id = p_order_id
       and status = 'in_progress';

  elsif v_in_progress > 0 or v_resolved > 0 then
    -- At least one ticket in flight → in_progress.
    update public.technical_orders
       set status = 'in_progress'
     where id = p_order_id
       and status = 'confirmed';
  end if;
end;
$$;


ALTER FUNCTION "public"."recompute_technical_order_status"("p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_order_key_pickup"("p_key_id" "uuid", "p_picked_up_by_name" "text", "p_picked_up_by_surname" "text", "p_picked_up_by_dni" "text", "p_actor_staff_id" "uuid" DEFAULT NULL::"uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_order_id     uuid;
  v_order_status text;
  v_total        int;
  v_done         int;
begin
  -- Lock the key row.
  perform 1 from public.rfid_keys where id = p_key_id for update;
  if not found then
    raise exception 'record_order_key_pickup: key % not found', p_key_id
      using errcode = 'P0001';
  end if;

  -- Locate the owning key_order via key_order_items.produced_key_id.
  select koi.order_id
    into v_order_id
    from public.key_order_items koi
   where koi.produced_key_id = p_key_id
   limit 1;

  if v_order_id is null then
    raise exception 'record_order_key_pickup: key % is not linked to any key_order', p_key_id
      using errcode = 'P0001';
  end if;

  -- Lock the owning order; only status is inspected here — DNI/authorized
  -- particular checks live in rfid_keys_validate_pickup and apply uniformly
  -- to both particular and administration flows.
  select status
    into v_order_status
    from public.key_orders
   where id = v_order_id
     for update;

  if v_order_status <> 'ready_for_pickup' then
    raise exception
      'record_order_key_pickup: key_order % must be ready_for_pickup to register pickups (current status: %)',
      v_order_id, v_order_status
      using errcode = 'P0001';
  end if;

  -- Record the pickup; rfid_keys_validate_pickup validates the DNI against
  -- the order-authorized DNIs before write and rejects orders (of any
  -- client_type) that have no authorized particular.
  update public.rfid_keys
     set picked_up_by_name     = p_picked_up_by_name,
         picked_up_by_surname  = p_picked_up_by_surname,
         picked_up_by_dni      = p_picked_up_by_dni,
         picked_up_at          = now(),
         delivered_by_staff_id = p_actor_staff_id
   where id = p_key_id;

  -- Auto-complete: every non-cancelled item must have a picked_up_at.
  select
    count(*) filter (where koi.status <> 'cancelled'),
    count(*) filter (where koi.status <> 'cancelled' and rk.picked_up_at is not null)
    into v_total, v_done
    from public.key_order_items koi
    left join public.rfid_keys rk on rk.id = koi.produced_key_id
   where koi.order_id = v_order_id;

  if v_total > 0 and v_done = v_total then
    update public.key_orders
       set status = 'completed'
     where id = v_order_id;
  end if;
end;
$$;


ALTER FUNCTION "public"."record_order_key_pickup"("p_key_id" "uuid", "p_picked_up_by_name" "text", "p_picked_up_by_surname" "text", "p_picked_up_by_dni" "text", "p_actor_staff_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_key_disable"("p_key_id" "uuid", "p_actor_staff_id" "uuid" DEFAULT NULL::"uuid", "p_note" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'identity'
    AS $$
declare
  v_status text;
  v_actor  uuid;
begin
  v_actor := coalesce(p_actor_staff_id, identity.current_staff_id());

  select status into v_status
    from public.rfid_keys
   where id = p_key_id
   for update;

  if v_status is null then
    raise exception 'request_key_disable: key % not found', p_key_id
      using errcode = 'P0001';
  end if;

  -- Idempotent no-op
  if v_status = 'pending_disable' then
    return;
  end if;

  if v_status <> 'active' then
    raise exception 'request_key_disable: key % must be active to request disable (current status: %)',
      p_key_id, v_status
      using errcode = 'P0001';
  end if;

  update public.rfid_keys set status = 'pending_disable' where id = p_key_id;

  insert into public.key_events (key_id, event_type, note, actor_staff_id)
    values (
      p_key_id,
      'disable_requested',
      coalesce(p_note, 'Baja solicitada'),
      v_actor
    );
end;
$$;


ALTER FUNCTION "public"."request_key_disable"("p_key_id" "uuid", "p_actor_staff_id" "uuid", "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_equipment_installation"("p_ticket_id" "uuid", "p_serial" "text", "p_unit_id" "uuid" DEFAULT NULL::"uuid", "p_note" "text" DEFAULT NULL::"text", "p_actor_staff_id" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'support', 'operations', 'identity'
    AS $$
declare
  v_ticket_category          text;
  v_ticket_status            text;
  v_building_id              uuid;
  v_description              text;
  v_technical_order_item_id  uuid;
  v_equipment_id             uuid;
  v_product_id               uuid;
  v_quantity                 int;
  v_order_id                 uuid;
  v_order_item_id            uuid;
  v_order_kind               text;
  v_actor                    uuid;
begin
  v_actor := coalesce(p_actor_staff_id, identity.current_staff_id());

  if p_serial is null or length(trim(p_serial)) = 0 then
    raise exception 'resolve_equipment_installation: serial is required'
      using errcode = 'P0001';
  end if;

  select category, status, building_id, description, technical_order_item_id
    into v_ticket_category, v_ticket_status, v_building_id, v_description,
         v_technical_order_item_id
    from support.tickets
   where id = p_ticket_id
   for update;

  if v_ticket_category is null then
    raise exception 'resolve_equipment_installation: ticket % not found', p_ticket_id
      using errcode = 'P0001';
  end if;

  if v_ticket_category <> 'equipment_installation' then
    raise exception
      'resolve_equipment_installation: ticket % is not an equipment_installation (category: %)',
      p_ticket_id, v_ticket_category
      using errcode = 'P0001';
  end if;

  if v_ticket_status = 'resolved' then
    raise exception 'resolve_equipment_installation: ticket % is already resolved', p_ticket_id
      using errcode = 'P0001';
  end if;

  insert into operations.equipment (
    serial_number,
    building_id,
    description,
    status,
    notes
  ) values (
    trim(p_serial),
    v_building_id,
    coalesce(nullif(trim(v_description), ''),
             'Equipo instalado (ticket ' || p_ticket_id || ')'),
    'active',
    'Instalado desde ticket ' || p_ticket_id
      || case when p_unit_id is not null
              then ' — unidad ' || p_unit_id::text
              else '' end
  )
  returning id into v_equipment_id;

  update support.tickets
     set equipment_id = v_equipment_id
   where id = p_ticket_id;

  -- Locate the originating reserva only via the new dual-FK path. Freestanding
  -- tickets (no technical_order_item_id) have no reserva to consume and produce
  -- no stock movements.
  if v_technical_order_item_id is not null then
    select sm.order_item_id, sm.product_id, toi.order_id, toi.quantity,
           sm.order_kind
      into v_order_item_id, v_product_id, v_order_id, v_quantity, v_order_kind
      from public.stock_movements sm
      join public.technical_order_items toi on toi.id = sm.order_item_id
     where sm.order_item_id = v_technical_order_item_id
       and sm.type          = 'reserva'
       and sm.order_kind    = 'technical'
     limit 1;
  end if;

  if v_product_id is not null then
    insert into public.stock_movements (
      product_id, type, quantity, note, order_id, order_item_id,
      order_kind, ticket_id, created_by
    ) values (
      v_product_id, 'egreso_instalacion', -v_quantity,
      'Egreso por instalación de equipo (ticket ' || p_ticket_id || ')',
      v_order_id, v_order_item_id, v_order_kind, p_ticket_id, v_actor
    );

    insert into public.stock_movements (
      product_id, type, quantity, note, order_id, order_item_id,
      order_kind, ticket_id, created_by
    ) values (
      v_product_id, 'liberacion_reserva', v_quantity,
      'Liberación de reserva al instalar equipo (ticket ' || p_ticket_id || ')',
      v_order_id, v_order_item_id, v_order_kind, p_ticket_id, v_actor
    );
  end if;

  update support.tickets
     set status = 'in_progress'
   where id = p_ticket_id
     and status = 'open';

  update support.tickets
     set status               = 'resolved',
         resolved_by_staff_id = v_actor,
         resolution_notes     = coalesce(
           nullif(trim(coalesce(p_note, '')), ''),
           'Equipo instalado (serial ' || trim(p_serial) || ')'
         )
   where id = p_ticket_id
     and status = 'in_progress';

  return v_equipment_id;
end;
$$;


ALTER FUNCTION "public"."resolve_equipment_installation"("p_ticket_id" "uuid", "p_serial" "text", "p_unit_id" "uuid", "p_note" "text", "p_actor_staff_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_equipment_replacement"("p_ticket_id" "uuid", "p_old_equipment_id" "uuid", "p_new_serial" "text", "p_new_model" "text" DEFAULT NULL::"text", "p_new_description" "text" DEFAULT NULL::"text", "p_note" "text" DEFAULT NULL::"text", "p_actor_staff_id" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'support', 'operations', 'identity'
    AS $$
declare
  v_ticket_category          text;
  v_ticket_status            text;
  v_technical_order_item_id  uuid;
  v_new_equipment_id         uuid;
  v_product_id               uuid;
  v_quantity                 int;
  v_order_id                 uuid;
  v_order_item_id            uuid;
  v_order_kind               text;
  v_actor                    uuid;
  v_item_product_id          uuid;
  v_product_name             text;
  v_effective_model          text;
begin
  v_actor := coalesce(p_actor_staff_id, identity.current_staff_id());

  if p_new_serial is null or length(trim(p_new_serial)) = 0 then
    raise exception 'resolve_equipment_replacement: new serial is required'
      using errcode = 'P0001';
  end if;

  select category, status, technical_order_item_id
    into v_ticket_category, v_ticket_status, v_technical_order_item_id
    from support.tickets
   where id = p_ticket_id
   for update;

  if v_ticket_category is null then
    raise exception 'resolve_equipment_replacement: ticket % not found', p_ticket_id
      using errcode = 'P0001';
  end if;

  if v_ticket_category <> 'equipment_replacement' then
    raise exception
      'resolve_equipment_replacement: ticket % is not equipment_replacement (category: %)',
      p_ticket_id, v_ticket_category
      using errcode = 'P0001';
  end if;

  if v_ticket_status = 'resolved' then
    raise exception 'resolve_equipment_replacement: ticket % is already resolved', p_ticket_id
      using errcode = 'P0001';
  end if;

  -- Resolve the effective model: caller-supplied wins; otherwise fall back to
  -- the product name chosen at order time. Freestanding tickets (no
  -- technical_order_item) still require the caller to supply the model.
  v_effective_model := nullif(trim(coalesce(p_new_model, '')), '');
  if v_effective_model is null and v_technical_order_item_id is not null then
    select toi.product_id, p.name
      into v_item_product_id, v_product_name
      from public.technical_order_items toi
      left join public.products p on p.id = toi.product_id
     where toi.id = v_technical_order_item_id;

    v_effective_model := v_product_name;
  end if;

  if v_effective_model is null then
    raise exception 'resolve_equipment_replacement: new model is required (no product on ticket to fall back to)'
      using errcode = 'P0001';
  end if;

  v_new_equipment_id := operations.replace_equipment(
    p_old_equipment_id,
    trim(p_new_serial),
    v_effective_model,
    coalesce(p_new_description, ''),
    null,
    'Replaced via ticket ' || p_ticket_id,
    v_actor
  );

  if v_technical_order_item_id is not null then
    select sm.order_item_id, sm.product_id, toi.order_id, toi.quantity,
           sm.order_kind
      into v_order_item_id, v_product_id, v_order_id, v_quantity, v_order_kind
      from public.stock_movements sm
      join public.technical_order_items toi on toi.id = sm.order_item_id
     where sm.order_item_id = v_technical_order_item_id
       and sm.type          = 'reserva'
       and sm.order_kind    = 'technical'
     limit 1;
  end if;

  if v_product_id is not null then
    insert into public.stock_movements (
      product_id, type, quantity, note, order_id, order_item_id,
      order_kind, ticket_id, created_by
    ) values (
      v_product_id, 'egreso_reemplazo', -v_quantity,
      'Egreso por reemplazo de equipo (ticket ' || p_ticket_id || ')',
      v_order_id, v_order_item_id, v_order_kind, p_ticket_id, v_actor
    );

    insert into public.stock_movements (
      product_id, type, quantity, note, order_id, order_item_id,
      order_kind, ticket_id, created_by
    ) values (
      v_product_id, 'liberacion_reserva', v_quantity,
      'Liberación de reserva al reemplazar equipo (ticket ' || p_ticket_id || ')',
      v_order_id, v_order_item_id, v_order_kind, p_ticket_id, v_actor
    );
  end if;

  update support.tickets
     set equipment_id = v_new_equipment_id
   where id = p_ticket_id;

  update support.tickets
     set status = 'in_progress'
   where id = p_ticket_id
     and status = 'open';

  update support.tickets
     set status               = 'resolved',
         resolved_by_staff_id = v_actor,
         resolution_notes     = coalesce(
           nullif(trim(coalesce(p_note, '')), ''),
           'Equipo reemplazado (serial ' || trim(p_new_serial) || ')'
         )
   where id = p_ticket_id
     and status = 'in_progress';

  return v_new_equipment_id;
end;
$$;


ALTER FUNCTION "public"."resolve_equipment_replacement"("p_ticket_id" "uuid", "p_old_equipment_id" "uuid", "p_new_serial" "text", "p_new_model" "text", "p_new_description" "text", "p_note" "text", "p_actor_staff_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_equipment_update"("p_task_id" "uuid", "p_actor_staff_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'support', 'operations', 'identity'
    AS $$
declare
  v_ticket_id       uuid;
  v_ticket_category text;
  v_ticket_status   text;
  v_equipment_id    uuid;
  v_actor           uuid;
  v_key_id          uuid;
  v_key_status      text;
  v_auth_id         uuid;
  v_order_item_id   uuid;
  v_order_id        uuid;
  v_keys_to_activate uuid[];
  v_keys_to_disable  uuid[];
  v_skipped          uuid[] := '{}';
  -- New-path key_order_items advancement
  v_koi_id          uuid;
  v_koi_status      text;
begin
  v_actor := coalesce(p_actor_staff_id, identity.current_staff_id());

  -- Lock the task row and retrieve snapshot.
  select ticket_id, equipment_id, keys_to_activate, keys_to_disable
    into v_ticket_id, v_equipment_id, v_keys_to_activate, v_keys_to_disable
    from support.equipment_updates
   where id = p_task_id
   for update;

  if v_ticket_id is null then
    raise exception 'resolve_equipment_update: task % not found', p_task_id
      using errcode = 'P0001';
  end if;

  -- Lock and validate the ticket.
  select category, status
    into v_ticket_category, v_ticket_status
    from support.tickets
   where id = v_ticket_id
   for update;

  if v_ticket_category <> 'equipment_update' then
    raise exception 'resolve_equipment_update: ticket % is not equipment_update (category: %)',
      v_ticket_id, v_ticket_category
      using errcode = 'P0001';
  end if;

  if v_ticket_status = 'resolved' then
    raise exception 'resolve_equipment_update: task % is already resolved', p_task_id
      using errcode = 'P0001';
  end if;

  if v_ticket_status not in ('open', 'in_progress') then
    raise exception 'resolve_equipment_update: ticket % has unexpected status %',
      v_ticket_id, v_ticket_status
      using errcode = 'P0001';
  end if;

  -- Transition ticket: open → in_progress (no-op if already in_progress).
  update support.tickets set status = 'in_progress'
   where id = v_ticket_id and status = 'open';

  -- -------------------------------------------------------
  -- Process keys_to_activate: pending_installation → active
  -- -------------------------------------------------------
  foreach v_key_id in array v_keys_to_activate loop
    -- Lock the key row.
    select status, order_item_id
      into v_key_status, v_order_item_id
      from public.rfid_keys
     where id = v_key_id
     for update;

    if v_key_status = 'pending_installation' then
      -- 1. Advance key to active.
      update public.rfid_keys set status = 'active' where id = v_key_id;

      -- 2. Mint key_authorization. The key_authorizations_validate trigger
      --    forces sync_state='pending_install' on INSERT and checks key is active.
      --    We INSERT now that the key IS active, then immediately UPDATE to installed.
      insert into operations.key_authorizations (rfid_key_id, equipment_id)
        values (v_key_id, v_equipment_id)
        returning id into v_auth_id;

      -- 3. Advance authorization to installed in the same transaction.
      --    The equipment update IS the install act; no separate installer trip needed.
      update operations.key_authorizations
         set sync_state = 'installed'
       where id = v_auth_id;

      -- 4. Emit activated key_event.
      insert into public.key_events (key_id, event_type, note, actor_staff_id)
        values (v_key_id, 'activated', 'Activada por actualización de equipo ' || p_task_id, v_actor);

      -- 5. Legacy order_items branch: recompute order status if key linked via old path.
      if v_order_item_id is not null then
        select order_id into v_order_id from public.order_items where id = v_order_item_id;
        if v_order_id is not null then
          perform public.recompute_order_status(v_order_id);
        end if;
      end if;

      -- 6. New-path key_order_items branch: advance the item that produced this key.
      --    Applies only when key_order_items.produced_key_id = v_key_id and status = 'configured'.
      --    The key_order_items_recompute_order_status_trigger drives key_orders automatically.
      select id, status
        into v_koi_id, v_koi_status
        from public.key_order_items
       where produced_key_id = v_key_id;

      if found and v_koi_status = 'configured' then
        update public.key_order_items
           set status = 'installed'
         where id = v_koi_id;
      end if;

    else
      -- Stale key: collect id, emit snapshot_skipped event, do not abort.
      v_skipped := array_append(v_skipped, v_key_id);
      insert into public.key_events (key_id, event_type, note, actor_staff_id)
        values (v_key_id, 'snapshot_skipped',
                'Estado inesperado al resolver (esperado: pending_installation, actual: ' || coalesce(v_key_status, 'NULL') || ')',
                v_actor);
    end if;
  end loop;

  -- -------------------------------------------------------
  -- Process keys_to_disable: pending_disable → disabled
  -- -------------------------------------------------------
  foreach v_key_id in array v_keys_to_disable loop
    select status
      into v_key_status
      from public.rfid_keys
     where id = v_key_id
     for update;

    if v_key_status = 'pending_disable' then
      update public.rfid_keys set status = 'disabled' where id = v_key_id;

      -- Update existing key_authorizations to removed
      update operations.key_authorizations
         set sync_state          = 'pending_removal',
             removed_by_staff_id = v_actor
       where rfid_key_id = v_key_id
         and equipment_id = v_equipment_id
         and sync_state   = 'installed';

      update operations.key_authorizations
         set sync_state          = 'removed',
             removed_by_staff_id = v_actor
       where rfid_key_id = v_key_id
         and equipment_id = v_equipment_id
         and sync_state   = 'pending_removal';

      insert into public.key_events (key_id, event_type, note, actor_staff_id)
        values (v_key_id, 'disabled', 'Desactivada por actualización de equipo ' || p_task_id, v_actor);
    else
      -- Stale key: collect id, emit snapshot_skipped event, do not abort.
      v_skipped := array_append(v_skipped, v_key_id);
      insert into public.key_events (key_id, event_type, note, actor_staff_id)
        values (v_key_id, 'snapshot_skipped',
                'Estado inesperado al resolver (esperado: pending_disable, actual: ' || coalesce(v_key_status, 'NULL') || ')',
                v_actor);
    end if;
  end loop;

  -- -------------------------------------------------------
  -- Resolve ticket: in_progress → resolved
  -- -------------------------------------------------------
  update support.tickets
     set status               = 'resolved',
         resolved_by_staff_id = v_actor,
         resolution_notes     = 'Actualización de equipo resuelta (tarea ' || p_task_id || ')'
   where id = v_ticket_id
     and status = 'in_progress';

  -- Mark the task as resolved.
  update support.equipment_updates
     set resolved_at           = now(),
         resolved_by_staff_id  = v_actor
   where id = p_task_id;

  return jsonb_build_object(
    'ticket_id', v_ticket_id,
    'skipped_key_ids', to_jsonb(v_skipped)
  );
end;
$$;


ALTER FUNCTION "public"."resolve_equipment_update"("p_task_id" "uuid", "p_actor_staff_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_ticket"("p_ticket_id" "uuid", "p_note" "text" DEFAULT NULL::"text", "p_actor_staff_id" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'support', 'operations', 'extensions'
    AS $$
declare
  v_actor                   uuid;
  v_updated                 int := 0;
  v_rows                    int;
  v_ticket                  record;
  v_toi                     record;
  v_effective_model         text;
  v_new_equipment_id        uuid;
  v_stock_note              text;
begin
  v_actor := identity.current_staff_id();
  if v_actor is null then
    v_actor := p_actor_staff_id;
  end if;
  if v_actor is null then
    raise exception 'resolve_ticket: no authenticated staff' using errcode = 'P0001';
  end if;

  select id, category, status, building_id, equipment_id,
         technical_order_item_id, pending_new_serial, pending_new_model
    into v_ticket
    from support.tickets
   where id = p_ticket_id
   for update;

  if v_ticket.id is null then
    raise exception
      'resolve_ticket: ticket % cannot be resolved by this user (not found, already resolved/cancelled, or not assigned)',
      p_ticket_id
      using errcode = 'P0001';
  end if;

  -- Bail early if terminal.
  if v_ticket.status in ('resolved', 'cancelled') then
    raise exception
      'resolve_ticket: ticket % cannot be resolved by this user (not found, already resolved/cancelled, or not assigned)',
      p_ticket_id
      using errcode = 'P0001';
  end if;

  -- Category-specific side effects for equipment tickets. Runs BEFORE the
  -- status transitions so tickets_require_equipment_on_resolve sees a valid
  -- equipment_id at the resolved hop.
  if v_ticket.category in ('equipment_installation', 'equipment_replacement') then
    if v_ticket.pending_new_serial is null
       or length(trim(v_ticket.pending_new_serial)) = 0 then
      raise exception
        'resolve_ticket: ticket % (%) requires configure_technical_ticket_equipment before resolve',
        p_ticket_id, v_ticket.category
        using errcode = 'P0001';
    end if;

    -- Flag lets tickets_enforce_installer_columns permit the equipment_id
    -- change we're about to make on the ticket. Transaction-scoped so it
    -- cannot leak into unrelated statements outside this resolve.
    perform set_config('app.allow_installer_equipment_swap', 'true', true);

    -- Read the linked technical_order_item to source product + quantity for
    -- stock movements and to fall back on product.name for the model.
    if v_ticket.technical_order_item_id is not null then
      select toi.id, toi.product_id, toi.quantity, toi.order_id, p.name as product_name
        into v_toi
        from public.technical_order_items toi
        left join public.products p on p.id = toi.product_id
       where toi.id = v_ticket.technical_order_item_id;
    end if;

    v_effective_model := coalesce(
      nullif(trim(coalesce(v_ticket.pending_new_model, '')), ''),
      v_toi.product_name
    );

    if v_effective_model is null then
      raise exception
        'resolve_ticket: ticket % has no model (neither pending_new_model nor linked product name)',
        p_ticket_id
        using errcode = 'P0001';
    end if;

    if v_ticket.category = 'equipment_installation' then
      -- Freestanding installation ticket needs building_id to create equipment.
      if v_ticket.building_id is null then
        raise exception
          'resolve_ticket: equipment_installation ticket % has no building_id',
          p_ticket_id
          using errcode = 'P0001';
      end if;

      insert into operations.equipment (
        serial_number, model, building_id, description, status
      ) values (
        trim(v_ticket.pending_new_serial),
        v_effective_model,
        v_ticket.building_id,
        '',
        'active'
      )
      returning id into v_new_equipment_id;

      update support.tickets
         set equipment_id = v_new_equipment_id
       where id = p_ticket_id;

      if v_toi.product_id is not null then
        v_stock_note := 'Egreso por instalación (ticket ' || p_ticket_id || ')';
        insert into public.stock_movements (
          product_id, type, quantity, note, order_id, order_item_id,
          order_kind, ticket_id, created_by
        ) values (
          v_toi.product_id, 'egreso_instalacion', -v_toi.quantity, v_stock_note,
          v_toi.order_id, v_toi.id, 'technical', p_ticket_id, v_actor
        );
        insert into public.stock_movements (
          product_id, type, quantity, note, order_id, order_item_id,
          order_kind, ticket_id, created_by
        ) values (
          v_toi.product_id, 'liberacion_reserva', v_toi.quantity,
          'Liberación de reserva al instalar equipo (ticket ' || p_ticket_id || ')',
          v_toi.order_id, v_toi.id, 'technical', p_ticket_id, v_actor
        );
      end if;

    else -- equipment_replacement
      if v_ticket.equipment_id is null then
        raise exception
          'resolve_ticket: equipment_replacement ticket % has no old equipment_id',
          p_ticket_id
          using errcode = 'P0001';
      end if;

      v_new_equipment_id := operations.replace_equipment(
        v_ticket.equipment_id,
        trim(v_ticket.pending_new_serial),
        v_effective_model,
        '',
        null,
        'Replaced via ticket ' || p_ticket_id,
        v_actor,
        true  -- activate keys directly on the new device
      );

      update support.tickets
         set equipment_id = v_new_equipment_id
       where id = p_ticket_id;

      if v_toi.product_id is not null then
        v_stock_note := 'Egreso por reemplazo de equipo (ticket ' || p_ticket_id || ')';
        insert into public.stock_movements (
          product_id, type, quantity, note, order_id, order_item_id,
          order_kind, ticket_id, created_by
        ) values (
          v_toi.product_id, 'egreso_reemplazo', -v_toi.quantity, v_stock_note,
          v_toi.order_id, v_toi.id, 'technical', p_ticket_id, v_actor
        );
        insert into public.stock_movements (
          product_id, type, quantity, note, order_id, order_item_id,
          order_kind, ticket_id, created_by
        ) values (
          v_toi.product_id, 'liberacion_reserva', v_toi.quantity,
          'Liberación de reserva al reemplazar equipo (ticket ' || p_ticket_id || ')',
          v_toi.order_id, v_toi.id, 'technical', p_ticket_id, v_actor
        );
      end if;
    end if;
  end if;

  -- Standard two-step transition: open → in_progress → resolved. Idempotent
  -- when the ticket is already in_progress (configure step already ran).
  update support.tickets
     set status = 'in_progress'
   where id = p_ticket_id
     and status = 'open';
  get diagnostics v_updated = row_count;

  update support.tickets
     set status               = 'resolved',
         resolved_by_staff_id = v_actor,
         resolved_at          = coalesce(resolved_at, now()),
         resolution_notes     = coalesce(
           nullif(trim(coalesce(p_note, '')), ''),
           'Resuelta por ' || coalesce(
             (select s.full_name from identity.staff s where s.id = v_actor),
             'staff'
           )
         )
   where id = p_ticket_id
     and status = 'in_progress';
  get diagnostics v_rows = row_count;
  v_updated := v_updated + v_rows;

  if v_updated = 0 then
    raise exception
      'resolve_ticket: ticket % cannot be resolved by this user (not found, already resolved/cancelled, or not assigned)',
      p_ticket_id
      using errcode = 'P0001';
  end if;

  return p_ticket_id;
end;
$$;


ALTER FUNCTION "public"."resolve_ticket"("p_ticket_id" "uuid", "p_note" "text", "p_actor_staff_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rfid_keys_auto_revoke_on_status_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.status in ('lost','disabled') and old.status = 'active' then
    perform operations.revoke_key_from_all_equipment(
      new.id,
      'Key marked as ' || new.status
    );
  end if;
  return null;
end;
$$;


ALTER FUNCTION "public"."rfid_keys_auto_revoke_on_status_change"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rfid_keys_auto_revoke_on_status_change"() IS 'Trigger AFTER UPDATE OF status: cuando la llave pasa de active a lost/disabled, invoca revoke_key_from_all_equipment para generar automáticamente la worklist de removal para el instalador.';



CREATE OR REPLACE FUNCTION "public"."rfid_keys_prevent_reassignment"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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
  if new.order_item_id is distinct from old.order_item_id then
    raise exception 'rfid_keys.order_item_id is immutable (key %)', old.id
      using errcode = 'check_violation';
  end if;
  -- Los campos de pickup, una vez seteados, no se pueden cambiar:
  -- esa es la evidencia del retiro.
  if old.picked_up_at is not null then
    if new.picked_up_at            is distinct from old.picked_up_at
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


ALTER FUNCTION "public"."rfid_keys_prevent_reassignment"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rfid_keys_prevent_reassignment"() IS 'Trigger BEFORE UPDATE: bloquea cambios a unit_id, rfid_code, key_request_item_id y a los campos picked_up_* una vez seteado picked_up_at. Inmutabilidad legal de la asignación de la llave.';



CREATE OR REPLACE FUNCTION "public"."rfid_keys_sync_deactivated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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


ALTER FUNCTION "public"."rfid_keys_sync_deactivated_at"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rfid_keys_sync_deactivated_at"() IS 'Trigger BEFORE INSERT/UPDATE: sincroniza deactivated_at con status (se completa al pasar a disabled/lost, se limpia si vuelve a active).';



CREATE OR REPLACE FUNCTION "public"."rfid_keys_trigger_request_recompute"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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


ALTER FUNCTION "public"."rfid_keys_trigger_request_recompute"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rfid_keys_trigger_request_recompute"() IS 'Trigger AFTER INSERT/UPDATE OF picked_up_at: dispara sales.recompute_request_status para avanzar el estado del key_request según cuántas llaves están producidas y cuántas retiradas.';



CREATE OR REPLACE FUNCTION "public"."rfid_keys_validate_pickup"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_authorized_dni text;
  v_request_status text;
  v_buyer_dni      text;
  v_pickup_dni     text;
  v_koi_id         uuid;
begin
  if new.picked_up_at is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.picked_up_at is not null then
    return new;  -- already validated; immutability enforced by prevent_reassignment
  end if;

  if new.picked_up_by_name is null
     or new.picked_up_by_surname is null
     or new.picked_up_by_dni is null then
    raise exception 'pickup fields (name, surname, dni) are required to set picked_up_at (key %)', new.id
      using errcode = 'check_violation';
  end if;

  -- Origin lookup — key_orders path (new).
  select koi.id
    into v_koi_id
    from public.key_order_items koi
   where koi.produced_key_id = new.id
   limit 1;

  -- Every pickup requires at least one production origin. The legacy
  -- public.order_items branch is intentionally omitted (retired in 000094).
  if new.key_request_item_id is null and v_koi_id is null then
    raise exception 'cannot record pickup without a production origin (key %)', new.id
      using errcode = 'check_violation';
  end if;

  -- KEY_ORDERS path.
  if v_koi_id is not null then
    select p.dni,
           coalesce(pp_item.dni, pp_order.dni)
      into v_buyer_dni, v_pickup_dni
      from public.key_order_items koi
      join public.key_orders ko             on ko.id       = koi.order_id
      left join public.particulares p        on p.id        = ko.particular_id
      left join public.particulares pp_item  on pp_item.id  = koi.pickup_particular_id
      left join public.particulares pp_order on pp_order.id = ko.pickup_particular_id
     where koi.id = v_koi_id;

    if v_buyer_dni is null and v_pickup_dni is null then
      raise exception 'key_order pickup requires an authorized particular (key %)', new.id
        using errcode = 'check_violation';
    end if;
    if new.picked_up_by_dni is distinct from v_buyer_dni
       and new.picked_up_by_dni is distinct from v_pickup_dni then
      raise exception 'pickup DNI (%) does not match the key_order authorized DNI', new.picked_up_by_dni
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  -- KEY_REQUEST path (unchanged).
  select kr.pickup_person_dni, kr.status
    into v_authorized_dni, v_request_status
    from sales.key_request_items kri
    join sales.key_requests kr on kr.id = kri.key_request_id
   where kri.id = new.key_request_item_id;

  if v_request_status not in ('ready_for_pickup', 'delivered') then
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


ALTER FUNCTION "public"."rfid_keys_validate_pickup"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rfid_keys_validate_pickup"() IS 'Trigger BEFORE INSERT/UPDATE de campos de pickup: valida que el DNI del retirador coincida con pickup_person_dni autorizado en el request, y que el request esté en ready_for_pickup/delivered.';



CREATE OR REPLACE FUNCTION "public"."rfid_keys_validate_request_link"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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


ALTER FUNCTION "public"."rfid_keys_validate_request_link"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rfid_keys_validate_request_link"() IS 'Trigger BEFORE INSERT: cuando se produce una rfid_key contra un key_request_item, valida que la unit coincida, que el request esté en estado authorized/in_production, y que no se exceda la quantity de la línea.';



CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."set_updated_at"() IS 'Trigger BEFORE UPDATE compartido: setea NEW.updated_at = now(). Aplicado a todas las tablas que tienen la columna updated_at.';



CREATE OR REPLACE FUNCTION "public"."stock_movements_maintain_counters"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  v_total_delta     int := 0;
  v_reservado_delta int := 0;
begin
  case new.type
    when 'compra'              then v_total_delta     :=  new.quantity;
    when 'devolucion'          then v_total_delta     :=  new.quantity;
    when 'ajuste_manual'       then v_total_delta     :=  new.quantity;
    when 'egreso_grabacion'    then v_total_delta     :=  new.quantity;
    when 'egreso_instalacion'  then v_total_delta     :=  new.quantity;
    when 'egreso_reemplazo'    then v_total_delta     :=  new.quantity;   -- negative → subtract
    when 'baja_defectuoso'     then v_total_delta     :=  new.quantity;
    when 'baja_perdida'        then v_total_delta     :=  new.quantity;
    when 'reserva'             then v_reservado_delta := -new.quantity;
    when 'liberacion_reserva'  then v_reservado_delta := -new.quantity;
    else
      raise exception 'stock_movements_maintain_counters: unknown type %', new.type
        using errcode = 'P0001';
  end case;

  update public.products
     set stock_total     = stock_total     + v_total_delta,
         stock_reservado = stock_reservado + v_reservado_delta
   where id = new.product_id;

  return null;
end;
$$;


ALTER FUNCTION "public"."stock_movements_maintain_counters"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."stock_movements_prevent_modification"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  raise exception 'stock_movements are append-only'
    using errcode = 'check_violation';
end;
$$;


ALTER FUNCTION "public"."stock_movements_prevent_modification"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."technical_order_items_intent_immutable"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_parent_status text;
begin
  if new.intended_equipment_id is not distinct from old.intended_equipment_id
     and new.intended_assignee_staff_id is not distinct from old.intended_assignee_staff_id
     and new.intended_replacement_equipment_id is not distinct from old.intended_replacement_equipment_id
  then
    return new;
  end if;

  select status into v_parent_status
    from public.technical_orders
   where id = new.order_id;

  if v_parent_status <> 'draft' then
    raise exception 'TECHNICAL_ORDER_ITEM_INTENT_LOCKED: intent columns (intended_equipment_id, intended_assignee_staff_id, intended_replacement_equipment_id) are immutable once the order leaves draft (order_id=%, status=%)',
      new.order_id, v_parent_status
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."technical_order_items_intent_immutable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."technical_orders_cancel_release_reservations"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'support', 'extensions'
    AS $$
declare
  v_movement record;
begin
  -- Only fires when transitioning INTO 'cancelled'.
  if new.status <> 'cancelled' or old.status = 'cancelled' then
    return new;
  end if;

  -- Release existing reservations by inserting opposing liberacion rows.
  for v_movement in
    select id, product_id, quantity, order_item_id
      from public.stock_movements
     where order_id = new.id
       and order_kind = 'technical'
       and type = 'reserva'
  loop
    insert into public.stock_movements (
      product_id, type, quantity, note, order_id, order_item_id, order_kind
    )
    values (
      v_movement.product_id,
      'liberacion_reserva',
      -v_movement.quantity,
      'Liberacion de reserva por cancelacion de technical_order ' || new.id::text,
      new.id,
      v_movement.order_item_id,
      'technical'
    );
  end loop;

  -- Cancel all non-resolved, non-cancelled linked tickets.
  -- tickets_validate requires cancellation_reason when status='cancelled'.
  update support.tickets
     set status              = 'cancelled',
         cancellation_reason = 'Orden técnica cancelada (order_id=' || new.id::text || ')'
   where technical_order_item_id in (
     select id from public.technical_order_items where order_id = new.id
   )
     and status not in ('resolved', 'cancelled');

  -- Cancel all non-terminal technical_order_items.
  update public.technical_order_items
     set status = 'cancelled'
   where order_id = new.id
     and status not in ('completed', 'cancelled');

  return new;
end;
$$;


ALTER FUNCTION "public"."technical_orders_cancel_release_reservations"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tickets_sync_order_status"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'support', 'extensions'
    AS $$
declare
  v_technical_order_id uuid;
begin
  -- Key orders do NOT sync from tickets. Only act when technical_order_item_id
  -- is populated. This matches design §4 intent.
  if new.technical_order_item_id is null then
    return new;
  end if;

  select order_id into v_technical_order_id
    from public.technical_order_items
   where id = new.technical_order_item_id;

  if v_technical_order_id is not null then
    perform public.recompute_technical_order_status(v_technical_order_id);
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."tickets_sync_order_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_draft_key_order_with_items"("p_order_id" "uuid", "p_patch" "jsonb", "p_items" "jsonb"[], "p_expected_updated_at" timestamp with time zone) RETURNS timestamp with time zone
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_order          record;
  v_new_updated_at timestamptz;
  v_item           jsonb;
  v_item_id        uuid;
  v_item_ids_kept  uuid[] := array[]::uuid[];
  v_unit_price     numeric(12, 2);
  v_qty            int;
  v_key_idx        int;
begin
  -- 1. Row-lock and verify.
  select id, status, updated_at
    into v_order
    from public.key_orders
   where id = p_order_id
   for update;

  if not found then
    raise exception 'KEY_ORDER_NOT_FOUND: key order % does not exist', p_order_id
      using errcode = 'P0001';
  end if;

  if v_order.status <> 'draft' then
    raise exception 'KEY_ORDER_NOT_DRAFT: key order % is not in draft status (current: %)',
      p_order_id, v_order.status
      using errcode = 'P0001';
  end if;

  if v_order.updated_at <> p_expected_updated_at then
    raise exception 'KEY_ORDER_STALE: key order % was modified concurrently (expected %, actual %)',
      p_order_id, p_expected_updated_at, v_order.updated_at
      using errcode = 'P0001';
  end if;

  -- 2. Apply patch to header (whitelisted columns only).
  update public.key_orders
     set
       notes                = coalesce(p_patch->>'notes',                 notes),
       client_type          = coalesce(p_patch->>'client_type',           client_type),
       administration_id    = case
                                when p_patch ? 'administration_id'
                                then (p_patch->>'administration_id')::uuid
                                else administration_id
                              end,
       particular_id        = case
                                when p_patch ? 'particular_id'
                                then (p_patch->>'particular_id')::uuid
                                else particular_id
                              end,
       particular_full_name = coalesce(p_patch->>'particular_full_name', particular_full_name),
       particular_dni       = coalesce(p_patch->>'particular_dni',       particular_dni),
       particular_phone     = coalesce(p_patch->>'particular_phone',     particular_phone),
       particular_email     = coalesce(p_patch->>'particular_email',     particular_email)
   where id = p_order_id
  returning updated_at into v_new_updated_at;

  -- 3. Item sync: upsert items present in payload; delete absent items.
  if p_items is not null then
    foreach v_item in array p_items loop
      v_item_id    := (v_item->>'id')::uuid;
      v_qty        := coalesce((v_item->>'quantity')::int, 1);
      v_unit_price := nullif(v_item->>'unit_price', '')::numeric(12, 2);

      -- Key packs (quantity > 1) are exploded into N rows.
      -- The first copy keeps the payload id when present (UPDATE path);
      -- remaining keys are INSERTed as new rows.
      if v_qty > 1 then
        if v_item_id is not null then
          -- Update the first copy.
          update public.key_order_items
             set
               quantity             = 1,
               description          = coalesce(v_item->>'description', description),
               building_id          = case when v_item ? 'building_id'
                                           then (v_item->>'building_id')::uuid
                                           else building_id end,
               product_id           = case when v_item ? 'product_id'
                                           then (v_item->>'product_id')::uuid
                                           else product_id end,
               unit_price           = case when v_item ? 'unit_price'
                                           then v_unit_price
                                           else unit_price end,
               unit_id              = case when v_item ? 'unit_id'
                                           then (v_item->>'unit_id')::uuid
                                           else unit_id end,
               pickup_particular_id = case when v_item ? 'pickup_particular_id'
                                           then (v_item->>'pickup_particular_id')::uuid
                                           else pickup_particular_id end
           where id = v_item_id
             and order_id = p_order_id;

          v_item_ids_kept := v_item_ids_kept || v_item_id;
        else
          -- New pack line, no existing id: insert first copy.
          insert into public.key_order_items (
            order_id, item_type, quantity, description, building_id,
            product_id, unit_price, unit_id, pickup_particular_id
          )
          values (
            p_order_id, 'key', 1, v_item->>'description',
            (v_item->>'building_id')::uuid,
            (v_item->>'product_id')::uuid,
            v_unit_price,
            (v_item->>'unit_id')::uuid,
            (v_item->>'pickup_particular_id')::uuid
          )
          returning id into v_item_id;

          v_item_ids_kept := v_item_ids_kept || v_item_id;
        end if;

        -- Remaining N-1 copies are always new inserts.
        for v_key_idx in 2..v_qty loop
          insert into public.key_order_items (
            order_id, item_type, quantity, description, building_id,
            product_id, unit_price, unit_id, pickup_particular_id
          )
          values (
            p_order_id, 'key', 1, v_item->>'description',
            (v_item->>'building_id')::uuid,
            (v_item->>'product_id')::uuid,
            v_unit_price,
            (v_item->>'unit_id')::uuid,
            (v_item->>'pickup_particular_id')::uuid
          )
          returning id into v_item_id;

          v_item_ids_kept := v_item_ids_kept || v_item_id;
        end loop;

      elsif v_item_id is not null then
        -- Existing single item: UPDATE.
        update public.key_order_items
           set
             quantity             = coalesce((v_item->>'quantity')::int, quantity),
             description          = coalesce(v_item->>'description',     description),
             building_id          = case when v_item ? 'building_id'
                                         then (v_item->>'building_id')::uuid
                                         else building_id end,
             product_id           = case when v_item ? 'product_id'
                                         then (v_item->>'product_id')::uuid
                                         else product_id end,
             unit_price           = case when v_item ? 'unit_price'
                                         then v_unit_price
                                         else unit_price end,
             unit_id              = case when v_item ? 'unit_id'
                                         then (v_item->>'unit_id')::uuid
                                         else unit_id end,
             pickup_particular_id = case when v_item ? 'pickup_particular_id'
                                         then (v_item->>'pickup_particular_id')::uuid
                                         else pickup_particular_id end
         where id = v_item_id
           and order_id = p_order_id;

        v_item_ids_kept := v_item_ids_kept || v_item_id;

      else
        -- New single item: INSERT.
        insert into public.key_order_items (
          order_id, item_type, quantity, description, building_id,
          product_id, unit_price, unit_id, pickup_particular_id
        )
        values (
          p_order_id, 'key', v_qty, v_item->>'description',
          (v_item->>'building_id')::uuid,
          (v_item->>'product_id')::uuid,
          v_unit_price,
          (v_item->>'unit_id')::uuid,
          (v_item->>'pickup_particular_id')::uuid
        )
        returning id into v_item_id;

        v_item_ids_kept := v_item_ids_kept || v_item_id;
      end if;
    end loop;

    -- Delete items that were NOT in the payload (only pending items — configured
    -- items cannot be deleted from a draft once configured, but that should not
    -- happen in normal flows since confirmed orders are not draft).
    delete from public.key_order_items
     where order_id = p_order_id
       and id <> all(v_item_ids_kept);
  end if;

  return v_new_updated_at;
end;
$$;


ALTER FUNCTION "public"."update_draft_key_order_with_items"("p_order_id" "uuid", "p_patch" "jsonb", "p_items" "jsonb"[], "p_expected_updated_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_draft_technical_order_with_items"("p_order_id" "uuid", "p_patch" "jsonb", "p_items" "jsonb"[], "p_expected_updated_at" timestamp with time zone) RETURNS timestamp with time zone
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_order          record;
  v_new_updated_at timestamptz;
  v_item           jsonb;
  v_item_id        uuid;
  v_item_ids_kept  uuid[] := array[]::uuid[];
  v_unit_price     numeric(12, 2);
begin
  select id, status, updated_at
    into v_order
    from public.technical_orders
   where id = p_order_id
   for update;

  if not found then
    raise exception 'TECHNICAL_ORDER_NOT_FOUND: technical order % does not exist', p_order_id
      using errcode = 'P0001';
  end if;

  if v_order.status <> 'draft' then
    raise exception 'TECHNICAL_ORDER_NOT_DRAFT: technical order % is not in draft status (current: %)',
      p_order_id, v_order.status
      using errcode = 'P0001';
  end if;

  if v_order.updated_at <> p_expected_updated_at then
    raise exception 'TECHNICAL_ORDER_STALE: technical order % was modified concurrently (expected %, actual %)',
      p_order_id, p_expected_updated_at, v_order.updated_at
      using errcode = 'P0001';
  end if;

  update public.technical_orders
     set
       notes                = coalesce(p_patch->>'notes',                 notes),
       client_type          = coalesce(p_patch->>'client_type',           client_type),
       administration_id    = case
                                when p_patch ? 'administration_id'
                                then (p_patch->>'administration_id')::uuid
                                else administration_id
                              end,
       particular_id        = case
                                when p_patch ? 'particular_id'
                                then (p_patch->>'particular_id')::uuid
                                else particular_id
                              end,
       particular_full_name = coalesce(p_patch->>'particular_full_name', particular_full_name),
       particular_dni       = coalesce(p_patch->>'particular_dni',       particular_dni),
       particular_phone     = coalesce(p_patch->>'particular_phone',     particular_phone),
       particular_email     = coalesce(p_patch->>'particular_email',     particular_email)
   where id = p_order_id
  returning updated_at into v_new_updated_at;

  if p_items is not null then
    foreach v_item in array p_items loop
      v_item_id    := (v_item->>'id')::uuid;
      v_unit_price := nullif(v_item->>'unit_price', '')::numeric(12, 2);

      if v_item_id is not null then
        update public.technical_order_items
           set
             item_type                          = coalesce(v_item->>'item_type', item_type),
             quantity                           = coalesce((v_item->>'quantity')::int, quantity),
             description                        = coalesce(v_item->>'description', description),
             unit_price                         = case when v_item ? 'unit_price'
                                                       then v_unit_price
                                                       else unit_price end,
             product_id                         = case when v_item ? 'product_id'
                                                       then (v_item->>'product_id')::uuid
                                                       else product_id end,
             intended_equipment_id              = case when v_item ? 'intended_equipment_id'
                                                       then (v_item->>'intended_equipment_id')::uuid
                                                       else intended_equipment_id end,
             intended_replacement_equipment_id  = case when v_item ? 'intended_replacement_equipment_id'
                                                       then (v_item->>'intended_replacement_equipment_id')::uuid
                                                       else intended_replacement_equipment_id end,
             intended_assignee_staff_id         = case when v_item ? 'intended_assignee_staff_id'
                                                       then (v_item->>'intended_assignee_staff_id')::uuid
                                                       else intended_assignee_staff_id end,
             building_id                        = case when v_item ? 'building_id'
                                                       then (v_item->>'building_id')::uuid
                                                       else building_id end
         where id = v_item_id
           and order_id = p_order_id;

        v_item_ids_kept := v_item_ids_kept || v_item_id;

      else
        insert into public.technical_order_items (
          order_id,
          item_type,
          quantity,
          description,
          unit_price,
          product_id,
          intended_equipment_id,
          intended_replacement_equipment_id,
          intended_assignee_staff_id,
          building_id
        )
        values (
          p_order_id,
          v_item->>'item_type',
          coalesce((v_item->>'quantity')::int, 1),
          v_item->>'description',
          v_unit_price,
          (v_item->>'product_id')::uuid,
          (v_item->>'intended_equipment_id')::uuid,
          (v_item->>'intended_replacement_equipment_id')::uuid,
          (v_item->>'intended_assignee_staff_id')::uuid,
          (v_item->>'building_id')::uuid
        )
        returning id into v_item_id;

        v_item_ids_kept := v_item_ids_kept || v_item_id;
      end if;
    end loop;

    delete from public.technical_order_items
     where order_id = p_order_id
       and id <> all(v_item_ids_kept);
  end if;

  return v_new_updated_at;
end;
$$;


ALTER FUNCTION "public"."update_draft_technical_order_with_items"("p_order_id" "uuid", "p_patch" "jsonb", "p_items" "jsonb"[], "p_expected_updated_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "sales"."bill_items_check_parent_editable"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_status text;
  v_bill_id uuid := coalesce(new.bill_id, old.bill_id);
begin
  select status into v_status from sales.bills where id = v_bill_id;
  if v_status is null then
    return coalesce(new, old);  -- parent fue borrado en cascade
  end if;
  if v_status <> 'draft' then
    raise exception 'cannot modify items of a bill in status % (only draft allows modifications)', v_status
      using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end;
$$;


ALTER FUNCTION "sales"."bill_items_check_parent_editable"() OWNER TO "postgres";


COMMENT ON FUNCTION "sales"."bill_items_check_parent_editable"() IS 'Trigger BEFORE INSERT/UPDATE/DELETE: bloquea modificación de items cuando bills.status != draft.';



CREATE OR REPLACE FUNCTION "sales"."bills_prevent_cancel_with_payments"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_payment_count int;
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    select count(*) into v_payment_count
      from sales.payments where bill_id = new.id;
    if v_payment_count > 0 then
      raise exception
        'cannot cancel bill % — it has % payment(s) attached. Void the payment(s) first.',
        new.bill_number, v_payment_count
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "sales"."bills_prevent_cancel_with_payments"() OWNER TO "postgres";


COMMENT ON FUNCTION "sales"."bills_prevent_cancel_with_payments"() IS 'Trigger BEFORE UPDATE OF status: bloquea confirmed → cancelled si hay payments existentes. Preserva integridad del balance (una bill cancelada con pago genera saldo negativo espurio).';



CREATE OR REPLACE FUNCTION "sales"."bills_validate"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if tg_op = 'UPDATE' then
    if new.administration_id is distinct from old.administration_id then
      raise exception 'bills.administration_id is immutable' using errcode = 'check_violation';
    end if;
    if new.from_quote_id is distinct from old.from_quote_id then
      raise exception 'bills.from_quote_id is immutable' using errcode = 'check_violation';
    end if;

    if new.status is distinct from old.status then
      if not (
        (old.status = 'draft'     and new.status in ('confirmed','cancelled'))
        or (old.status = 'confirmed' and new.status = 'cancelled')
      ) then
        raise exception 'invalid bills.status transition: % -> %', old.status, new.status
          using errcode = 'check_violation';
      end if;

      if new.status = 'cancelled' and (new.cancellation_reason is null or length(trim(new.cancellation_reason)) = 0) then
        raise exception 'cancellation_reason is required when status=cancelled'
          using errcode = 'check_violation';
      end if;
    end if;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "sales"."bills_validate"() OWNER TO "postgres";


COMMENT ON FUNCTION "sales"."bills_validate"() IS 'Trigger BEFORE UPDATE: inmutabilidad de administration_id + from_quote_id, máquina de estados draft → confirmed → cancelled, cancellation_reason requerido si status=cancelled.';



CREATE OR REPLACE FUNCTION "sales"."compute_item_subtotal"() RETURNS "trigger"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
begin
  new.subtotal := round(new.quantity * new.unit_price, 2);
  return new;
end;
$$;


ALTER FUNCTION "sales"."compute_item_subtotal"() OWNER TO "postgres";


COMMENT ON FUNCTION "sales"."compute_item_subtotal"() IS 'Trigger BEFORE INSERT/UPDATE: computa subtotal = round(quantity × unit_price, 2). Aplicado a quote_items y bill_items para garantizar consistencia (nunca se puede pisar el subtotal manualmente).';



CREATE OR REPLACE FUNCTION "sales"."gen_bill_number"() RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
begin
  return format('VNT-%s-%s',
                extract(year from now())::int,
                lpad(nextval('sales.bill_number_seq')::text, 6, '0'));
end;
$$;


ALTER FUNCTION "sales"."gen_bill_number"() OWNER TO "postgres";


COMMENT ON FUNCTION "sales"."gen_bill_number"() IS 'Genera el próximo bill_number con formato VNT-YYYY-000000 (sequence sales.bill_number_seq, sin reset anual).';



CREATE OR REPLACE FUNCTION "sales"."gen_key_request_number"() RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
begin
  return format('REQ-%s-%s',
                extract(year from now())::int,
                lpad(nextval('sales.key_request_number_seq')::text, 6, '0'));
end;
$$;


ALTER FUNCTION "sales"."gen_key_request_number"() OWNER TO "postgres";


COMMENT ON FUNCTION "sales"."gen_key_request_number"() IS 'Genera el próximo request_number con formato REQ-YYYY-000000 (sequence sales.key_request_number_seq, sin reset anual).';



CREATE OR REPLACE FUNCTION "sales"."gen_quote_number"() RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
begin
  return format('PRE-%s-%s',
                extract(year from now())::int,
                lpad(nextval('sales.quote_number_seq')::text, 6, '0'));
end;
$$;


ALTER FUNCTION "sales"."gen_quote_number"() OWNER TO "postgres";


COMMENT ON FUNCTION "sales"."gen_quote_number"() IS 'Genera el próximo quote_number con formato PRE-YYYY-000000 (sequence sales.quote_number_seq, sin reset anual).';



CREATE OR REPLACE FUNCTION "sales"."generate_recurring_charges"("p_year" integer, "p_month" integer) RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
declare
  v_charge_date date := make_date(p_year, p_month, 1);
  v_count       int := 0;
  r             record;
  v_bill_id     uuid;
begin
  if p_year < 2020 or p_year > 2100 then
    raise exception 'p_year out of range: %', p_year;
  end if;
  if p_month < 1 or p_month > 12 then
    raise exception 'p_month out of range: %', p_month;
  end if;

  for r in
    select rc.*
    from sales.recurring_charges rc
    where rc.is_active
      and rc.start_date <= v_charge_date
      and (rc.end_date is null or rc.end_date >= v_charge_date)
      and not exists (
        select 1
        from sales.bill_items bi
        join sales.bills b on b.id = bi.bill_id
        where b.administration_id = rc.administration_id
          and date_trunc('month', b.charge_date) = date_trunc('month', v_charge_date)
          and bi.related_recurring_charge_id = rc.id
      )
  loop
    insert into sales.bills (administration_id, charge_date, status, notes)
    values (r.administration_id, v_charge_date, 'draft',
            format('Auto-generado por generate_recurring_charges(%s, %s)', p_year, p_month))
    returning id into v_bill_id;

    insert into sales.bill_items
      (bill_id, product_id, description, quantity, unit_price, related_recurring_charge_id)
    values
      (v_bill_id, r.product_id, r.description, 1, r.monthly_amount, r.id);

    -- Confirmamos después de meter el item (draft porque el trigger de
    -- editabilidad de items solo permite modificar drafts).
    update sales.bills set status = 'confirmed' where id = v_bill_id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;


ALTER FUNCTION "sales"."generate_recurring_charges"("p_year" integer, "p_month" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "sales"."generate_recurring_charges"("p_year" integer, "p_month" integer) IS 'Genera bills confirmed para todos los recurring_charges activos del mes indicado, evitando duplicados. Retorna la cantidad de bills creadas.';



CREATE OR REPLACE FUNCTION "sales"."key_request_items_validate"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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


ALTER FUNCTION "sales"."key_request_items_validate"() OWNER TO "postgres";


COMMENT ON FUNCTION "sales"."key_request_items_validate"() IS 'Trigger BEFORE INSERT/UPDATE: valida que la unit sea de un edificio de la administración del request; en UPDATE bloquea cambio de key_request_id/unit_id y prohíbe reducir quantity por debajo del número de rfid_keys ya producidas.';



CREATE OR REPLACE FUNCTION "sales"."key_requests_validate"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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


ALTER FUNCTION "sales"."key_requests_validate"() OWNER TO "postgres";


COMMENT ON FUNCTION "sales"."key_requests_validate"() IS 'Trigger BEFORE INSERT/UPDATE: valida obligatoriedad de datos según requester_type (individual necesita más), auto-autoriza requests de administration, chequea que pickup_person esté completo antes de authorized, valida transiciones de status (permite saltos hacia adelante para soportar batch inserts), enforce inmutabilidad de pickup_person desde authorized.';



CREATE OR REPLACE FUNCTION "sales"."payments_validate"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_bill_status text;
  v_bill_total  numeric(14,2);
  v_bill_admin  uuid;
begin
  if tg_op = 'INSERT' then
    new.requires_invoice := (new.payment_method <> 'cash');

    select status, total_amount, administration_id
      into v_bill_status, v_bill_total, v_bill_admin
      from sales.bills where id = new.bill_id;

    if v_bill_status is null then
      raise exception 'bill % not found', new.bill_id;
    end if;
    if v_bill_status <> 'confirmed' then
      raise exception 'cannot register payment for bill in status % (must be confirmed)', v_bill_status
        using errcode = 'check_violation';
    end if;
    if new.administration_id <> v_bill_admin then
      raise exception 'payment administration (%) does not match bill administration (%)',
        new.administration_id, v_bill_admin
        using errcode = 'check_violation';
    end if;
    if new.amount <> v_bill_total then
      raise exception 'payment amount (%) must equal bill total (%). Partial payments not supported.',
        new.amount, v_bill_total
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  -- UPDATE
  if new.bill_id is distinct from old.bill_id then
    raise exception 'payments.bill_id is immutable' using errcode = 'check_violation';
  end if;
  if new.amount is distinct from old.amount then
    raise exception 'payments.amount is immutable' using errcode = 'check_violation';
  end if;
  if new.payment_method is distinct from old.payment_method then
    raise exception 'payments.payment_method is immutable' using errcode = 'check_violation';
  end if;
  -- requires_invoice se recalcula si (por alguna razón) el method cambiara,
  -- pero como es inmutable, este bloque no aplica. Preservamos igual.
  new.requires_invoice := (new.payment_method <> 'cash');
  return new;
end;
$$;


ALTER FUNCTION "sales"."payments_validate"() OWNER TO "postgres";


COMMENT ON FUNCTION "sales"."payments_validate"() IS 'Trigger BEFORE INSERT/UPDATE: autofilla requires_invoice según payment_method (cash=false, resto=true); en INSERT valida que la bill esté confirmed, que el amount matchee el total de la bill exactamente (sin parciales) y que la administration_id coincida; en UPDATE bloquea cambios a bill_id, amount, payment_method.';



CREATE OR REPLACE FUNCTION "sales"."quote_items_check_parent_editable"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_status text;
  v_quote_id uuid := coalesce(new.quote_id, old.quote_id);
begin
  select status into v_status from sales.quotes where id = v_quote_id;
  if v_status is null then
    return coalesce(new, old);
  end if;
  if v_status <> 'draft' then
    raise exception 'cannot modify items of a quote in status % (only draft allows modifications)', v_status
      using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end;
$$;


ALTER FUNCTION "sales"."quote_items_check_parent_editable"() OWNER TO "postgres";


COMMENT ON FUNCTION "sales"."quote_items_check_parent_editable"() IS 'Trigger BEFORE INSERT/UPDATE/DELETE: bloquea modificación de items cuando quotes.status != draft. Un quote enviado no puede cambiar sus líneas — hay que crear otro.';



CREATE OR REPLACE FUNCTION "sales"."quotes_validate"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if tg_op = 'UPDATE' then
    if new.administration_id is distinct from old.administration_id then
      raise exception 'quotes.administration_id is immutable' using errcode = 'check_violation';
    end if;

    if new.status is distinct from old.status then
      if not (
        (old.status = 'draft' and new.status in ('sent','cancelled'))
        or (old.status = 'sent'  and new.status in ('accepted','rejected','expired','cancelled'))
      ) then
        raise exception 'invalid quotes.status transition: % -> %', old.status, new.status
          using errcode = 'check_violation';
      end if;
    end if;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "sales"."quotes_validate"() OWNER TO "postgres";


COMMENT ON FUNCTION "sales"."quotes_validate"() IS 'Trigger BEFORE UPDATE: inmutabilidad de administration_id + máquina de estados draft → sent → accepted/rejected/expired/cancelled.';



CREATE OR REPLACE FUNCTION "sales"."recompute_bill_total"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_bill_id uuid := coalesce(new.bill_id, old.bill_id);
begin
  update sales.bills
     set total_amount = coalesce((
       select sum(subtotal) from sales.bill_items where bill_id = v_bill_id
     ), 0)
   where id = v_bill_id;
  return null;
end;
$$;


ALTER FUNCTION "sales"."recompute_bill_total"() OWNER TO "postgres";


COMMENT ON FUNCTION "sales"."recompute_bill_total"() IS 'Trigger AFTER INSERT/UPDATE/DELETE en bill_items: recomputa bills.total_amount = sum(subtotal). Idem quotes.';



CREATE OR REPLACE FUNCTION "sales"."recompute_quote_total"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_quote_id uuid := coalesce(new.quote_id, old.quote_id);
begin
  update sales.quotes
     set total_amount = coalesce((
       select sum(subtotal) from sales.quote_items where quote_id = v_quote_id
     ), 0)
   where id = v_quote_id;
  return null;
end;
$$;


ALTER FUNCTION "sales"."recompute_quote_total"() OWNER TO "postgres";


COMMENT ON FUNCTION "sales"."recompute_quote_total"() IS 'Trigger AFTER INSERT/UPDATE/DELETE en quote_items: recomputa quotes.total_amount = sum(subtotal). Garantiza que el total del header siempre matchee la suma de sus líneas.';



CREATE OR REPLACE FUNCTION "sales"."recompute_request_status"("p_request_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
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


ALTER FUNCTION "sales"."recompute_request_status"("p_request_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "sales"."recompute_request_status"("p_request_id" "uuid") IS 'Función helper: recalcula key_requests.status basándose en cuántas rfid_keys existen linkeadas y cuántas tienen picked_up_at. Invocada por triggers sobre rfid_keys, no directamente por la app.';



CREATE OR REPLACE FUNCTION "sales"."validate_product_active_on_reference"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_active boolean;
  v_name   text;
begin
  if new.product_id is null then
    return new;
  end if;
  -- En UPDATE, solo revalidar si el product_id cambió
  if tg_op = 'UPDATE' and new.product_id is not distinct from old.product_id then
    return new;
  end if;

  select is_active, name into v_active, v_name
    from sales.products where id = new.product_id;

  if not v_active then
    raise exception 'product "%" is inactive and cannot be referenced by new items', v_name
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "sales"."validate_product_active_on_reference"() OWNER TO "postgres";


COMMENT ON FUNCTION "sales"."validate_product_active_on_reference"() IS 'Trigger BEFORE INSERT/UPDATE: rechaza si el product_id referenciado tiene is_active=false. Aplicado a bill_items, quote_items y recurring_charges. Preserva las referencias históricas: solo restringe nuevas asociaciones.';



CREATE OR REPLACE FUNCTION "support"."auto_transition_equipment_on_maintenance"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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


ALTER FUNCTION "support"."auto_transition_equipment_on_maintenance"() OWNER TO "postgres";


COMMENT ON FUNCTION "support"."auto_transition_equipment_on_maintenance"() IS 'Trigger AFTER INSERT/UPDATE OF status: cuando un ticket con equipment_id + category=maintenance pasa a in_progress, marca automáticamente el equipo como maintenance (solo si estaba active). La vuelta a active es manual por decisión del admin.';



CREATE OR REPLACE FUNCTION "support"."enforce_installer_ticket_column_restrictions"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_role         text := identity.current_staff_role();
  v_allow_swap   boolean := coalesce(
    current_setting('app.allow_installer_equipment_swap', true), 'false'
  ) = 'true';
begin
  if v_role = 'installer' then
    if new.assigned_to_staff_id is distinct from old.assigned_to_staff_id then
      raise exception 'installer cannot reassign tickets'
        using errcode = 'insufficient_privilege';
    end if;
    if new.unit_id is distinct from old.unit_id
       or (not v_allow_swap and new.equipment_id is distinct from old.equipment_id)
       or new.description is distinct from old.description
       or new.related_bill_id is distinct from old.related_bill_id
       or new.related_key_request_id is distinct from old.related_key_request_id then
      raise exception 'installer cannot modify ticket metadata (unit, equipment, description, related_*)'
        using errcode = 'insufficient_privilege';
    end if;
    if new.cancellation_reason is distinct from old.cancellation_reason then
      raise exception 'installer cannot cancel tickets (admin only)'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "support"."enforce_installer_ticket_column_restrictions"() OWNER TO "postgres";


COMMENT ON FUNCTION "support"."enforce_installer_ticket_column_restrictions"() IS 'Trigger BEFORE UPDATE: cuando el que updatea es un installer (current_staff_role()="installer"), rechaza cambios a assigned_to, unit_id, equipment_id, description, related_*, cancellation_reason. Complemento column-level a las policies RLS que solo scope-an por row.';



CREATE OR REPLACE FUNCTION "support"."gen_ticket_number"() RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
begin
  return format('SOP-%s-%s',
                extract(year from now())::int,
                lpad(nextval('support.ticket_number_seq')::text, 6, '0'));
end;
$$;


ALTER FUNCTION "support"."gen_ticket_number"() OWNER TO "postgres";


COMMENT ON FUNCTION "support"."gen_ticket_number"() IS 'Genera el próximo ticket_number con formato SOP-YYYY-000000 (sequence support.ticket_number_seq, sin reset anual).';



CREATE OR REPLACE FUNCTION "support"."ticket_comments_prevent_modification"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  raise exception 'ticket_comments are append-only' using errcode = 'check_violation';
end;
$$;


ALTER FUNCTION "support"."ticket_comments_prevent_modification"() OWNER TO "postgres";


COMMENT ON FUNCTION "support"."ticket_comments_prevent_modification"() IS 'Trigger BEFORE UPDATE/DELETE: rechaza toda modificación o borrado de comentarios (append-only). Efecto secundario: hace que tickets tampoco se puedan borrar (el DELETE cascade a comments falla).';



CREATE OR REPLACE FUNCTION "support"."tickets_block_equipment_update_cancel_in_progress"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.status = 'cancelled'
     and old.status = 'in_progress'
     and old.category = 'equipment_update' then
    raise exception 'equipment_update in_progress tickets cannot be cancelled'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "support"."tickets_block_equipment_update_cancel_in_progress"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "support"."tickets_reject_key_installation_inserts"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.category = 'key_installation' then
    raise exception
      'key_installation is no longer a supported ticket category; see unify-work-tracking-model change (use operations.key_authorizations for install tracking).'
      using errcode = '22023';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "support"."tickets_reject_key_installation_inserts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "support"."tickets_require_equipment_on_resolve"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.status = 'resolved' and (old.status is distinct from 'resolved') then
    if new.category in (
      'maintenance',
      'installation',
      'equipment_installation',
      'equipment_replacement',
      'equipment_update'
    ) and new.equipment_id is null then
      raise exception
        'tickets: equipment_id required to resolve technical ticket (category=%)',
        new.category
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "support"."tickets_require_equipment_on_resolve"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "support"."tickets_resolution_chain"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'support', 'public'
    AS $$
begin
  -- Chain trigger kept for future categories; no active branches today.
  -- key_configuration → key_installation branch removed per
  -- unify-work-tracking-model change. Guard remains so future INSERTs
  -- are cheap (return null immediately for non-resolve transitions).
  if new.status <> 'resolved' or old.status = 'resolved' then
    return null;
  end if;
  return null;
end;
$$;


ALTER FUNCTION "support"."tickets_resolution_chain"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "support"."tickets_validate"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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


ALTER FUNCTION "support"."tickets_validate"() OWNER TO "postgres";


COMMENT ON FUNCTION "support"."tickets_validate"() IS 'Trigger BEFORE INSERT/UPDATE: valida coherencia cruzada (building ∈ administration, unit ∈ building, equipment ∈ building), motivos requeridos por estado (resolution_notes si resolved, cancellation_reason si cancelled), inmutabilidades de scope (administration/building/category/opened_*), máquina de estados con reapertura, autofill de resolved_at.';


SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "identity"."audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "actor_id" "uuid",
    "subject_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "before_value" "text",
    "after_value" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "audit_log_event_type_check" CHECK (("event_type" = ANY (ARRAY['role_changed'::"text", 'status_changed'::"text", 'created'::"text", 'deleted'::"text"])))
);


ALTER TABLE "identity"."audit_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "identity"."staff" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "auth_user_id" "uuid",
    "full_name" "text" NOT NULL,
    "email" "text",
    "phone" "text",
    "role" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "staff_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'installer'::"text"]))),
    CONSTRAINT "staff_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text"])))
);


ALTER TABLE "identity"."staff" OWNER TO "postgres";


COMMENT ON TABLE "identity"."staff" IS 'Empleado interno de Vitalock. Vinculable a auth.users via auth_user_id (opcional para pre-provisioning). role in (admin, installer, viewer) determina el nivel de acceso via RLS. Un staff "inactive" queda registrado para trazabilidad pero pierde acceso (helpers is_admin/is_installer requieren status=active).';



CREATE TABLE IF NOT EXISTS "operations"."equipment" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "serial_number" "text" NOT NULL,
    "model" "text",
    "building_id" "uuid" NOT NULL,
    "description" "text" NOT NULL,
    "access_type" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "replaces_equipment_id" "uuid",
    "installed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "decommissioned_at" timestamp with time zone,
    "decommission_reason" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "equipment_access_type_check" CHECK (("access_type" = ANY (ARRAY['principal'::"text", 'servicio'::"text", 'cochera'::"text", 'puerta_2'::"text", 'puerta_3'::"text", 'puerta_4'::"text", 'otro'::"text"]))),
    CONSTRAINT "equipment_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'maintenance'::"text", 'dead'::"text"])))
);


ALTER TABLE "operations"."equipment" OWNER TO "postgres";


COMMENT ON TABLE "operations"."equipment" IS 'Controladora física instalada en un edificio (una controladora = una puerta). serial_number, building_id, installed_at y replaces_equipment_id inmutables. Estados: active ↔ maintenance → dead (terminal). Al pasar a dead, un trigger cierra automáticamente todas sus key_authorizations.';



CREATE TABLE IF NOT EXISTS "operations"."key_authorizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rfid_key_id" "uuid" NOT NULL,
    "equipment_id" "uuid" NOT NULL,
    "sync_state" "text" DEFAULT 'pending_install'::"text" NOT NULL,
    "installed_at" timestamp with time zone,
    "installed_by_staff_id" "uuid",
    "removed_at" timestamp with time zone,
    "removed_by_staff_id" "uuid",
    "remove_reason" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reject_reason" "text",
    CONSTRAINT "key_authorizations_reject_reason_check" CHECK (((("sync_state" = 'cancelled'::"text") AND ("reject_reason" IS NOT NULL) AND ("length"(TRIM(BOTH FROM "reject_reason")) > 0)) OR (("sync_state" <> 'cancelled'::"text") AND ("reject_reason" IS NULL)))),
    CONSTRAINT "key_authorizations_sync_state_check" CHECK (("sync_state" = ANY (ARRAY['pending_install'::"text", 'installed'::"text", 'pending_removal'::"text", 'removed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "operations"."key_authorizations" OWNER TO "postgres";


COMMENT ON TABLE "operations"."key_authorizations" IS 'Relación N:M entre rfid_keys y equipment: qué llaves están (o deberían estar) cargadas en qué equipo. Restringida a llave y equipo del mismo edificio. sync_state modela el workflow del instalador: pending_install → installed → pending_removal → removed. Las FKs (rfid_key_id, equipment_id) son inmutables.';



CREATE TABLE IF NOT EXISTS "public"."administrations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_name" "text" NOT NULL,
    "tax_id" "text",
    "email" "text",
    "phone" "text",
    "address" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "administrations_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text"])))
);


ALTER TABLE "public"."administrations" OWNER TO "postgres";


COMMENT ON TABLE "public"."administrations" IS 'Ente comercial que factura. Es el único tipo de "cliente" que el sistema reconoce — propietarios e inquilinos NO son entidades, sus datos van como texto libre en rfid_keys.notes o key_requests.requester_*. Baja lógica via status="inactive" (nunca borrado físico por trazabilidad legal).';



CREATE TABLE IF NOT EXISTS "public"."key_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_number" "text" DEFAULT "public"."gen_key_order_number"() NOT NULL,
    "client_type" "text" NOT NULL,
    "administration_id" "uuid",
    "particular_id" "uuid",
    "particular_full_name" "text",
    "particular_dni" "text",
    "particular_phone" "text",
    "particular_email" "text",
    "pickup_particular_id" "uuid",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "key_orders_client_consistency" CHECK (((("client_type" = 'administration'::"text") AND ("administration_id" IS NOT NULL) AND ("particular_full_name" IS NULL)) OR (("client_type" = 'particular'::"text") AND ("administration_id" IS NULL) AND ("particular_full_name" IS NOT NULL)))),
    CONSTRAINT "key_orders_client_type_check" CHECK (("client_type" = ANY (ARRAY['administration'::"text", 'particular'::"text"]))),
    CONSTRAINT "key_orders_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'confirmed'::"text", 'in_progress'::"text", 'pending_installation'::"text", 'ready_for_pickup'::"text", 'completed'::"text", 'invoiced'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."key_orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."technical_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_number" "text" DEFAULT "public"."gen_technical_order_number"() NOT NULL,
    "client_type" "text" NOT NULL,
    "administration_id" "uuid",
    "particular_id" "uuid",
    "particular_full_name" "text",
    "particular_dni" "text",
    "particular_phone" "text",
    "particular_email" "text",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "technical_orders_client_consistency" CHECK (((("client_type" = 'administration'::"text") AND ("administration_id" IS NOT NULL) AND ("particular_full_name" IS NULL)) OR (("client_type" = 'particular'::"text") AND ("administration_id" IS NULL) AND ("particular_full_name" IS NOT NULL)))),
    CONSTRAINT "technical_orders_client_type_check" CHECK (("client_type" = ANY (ARRAY['administration'::"text", 'particular'::"text"]))),
    CONSTRAINT "technical_orders_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'confirmed'::"text", 'in_progress'::"text", 'completed'::"text", 'invoiced'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."technical_orders" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."all_orders" WITH ("security_invoker"='on') AS
 SELECT "ko"."id",
    "ko"."order_number",
    'key'::"text" AS "order_kind",
    "ko"."client_type",
    "ko"."administration_id",
    "ko"."particular_id",
    "ko"."particular_full_name",
    "ko"."status",
    "ko"."notes",
    "ko"."created_at",
    "ko"."updated_at"
   FROM "public"."key_orders" "ko"
UNION ALL
 SELECT "tor"."id",
    "tor"."order_number",
    'technical'::"text" AS "order_kind",
    "tor"."client_type",
    "tor"."administration_id",
    "tor"."particular_id",
    "tor"."particular_full_name",
    "tor"."status",
    "tor"."notes",
    "tor"."created_at",
    "tor"."updated_at"
   FROM "public"."technical_orders" "tor";


ALTER VIEW "public"."all_orders" OWNER TO "postgres";


COMMENT ON VIEW "public"."all_orders" IS 'Read-only unified reporting surface across key_orders and technical_orders. SECURITY INVOKER: base-table RLS applies to the caller. PII columns (particular_dni, particular_phone, particular_email) are excluded — see spec #225. Never used as a FK target. Used by /historial and future facturación aggregates.';



CREATE TABLE IF NOT EXISTS "public"."buildings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "administration_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "address" "text",
    "city" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "buildings_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text"])))
);


ALTER TABLE "public"."buildings" OWNER TO "postgres";


COMMENT ON TABLE "public"."buildings" IS 'Edificio perteneciente a una administración. Cada edificio hospeda 0+N equipment y contiene 1+N units. administration_id es FK RESTRICT — no se puede borrar una admin con edificios activos.';



CREATE TABLE IF NOT EXISTS "public"."rfid_keys" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rfid_code" "text" NOT NULL,
    "unit_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "notes" "text",
    "activated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deactivated_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "key_request_item_id" "uuid",
    "picked_up_at" timestamp with time zone,
    "picked_up_by_name" "text",
    "picked_up_by_surname" "text",
    "picked_up_by_dni" "text",
    "delivered_by_staff_id" "uuid",
    "order_item_id" "uuid",
    CONSTRAINT "rfid_keys_origin_mutex" CHECK ((("key_request_item_id" IS NULL) OR ("order_item_id" IS NULL))),
    CONSTRAINT "rfid_keys_status_check" CHECK (("status" = ANY (ARRAY['pending_creation'::"text", 'pending_installation'::"text", 'active'::"text", 'pending_disable'::"text", 'disabled'::"text"])))
);


ALTER TABLE "public"."rfid_keys" OWNER TO "postgres";


COMMENT ON TABLE "public"."rfid_keys" IS 'Tarjeta RFID física emitida por Vitalock. rfid_code único global. unit_id inmutable (regla de trazabilidad legal). Las llaves administrativas viven en la unit con is_administrative=true; el rol específico (portero, mantenimiento) va en notes. Puede opcionalmente estar vinculada a un key_request_item que la generó, y a los datos del retiro (picked_up_*).';



CREATE OR REPLACE VIEW "public"."equipment_inventory" WITH ("security_invoker"='on') AS
 SELECT "e"."id",
    "e"."serial_number",
    "e"."model",
    "e"."status",
    "e"."access_type",
    "b"."id" AS "building_id",
    "b"."name" AS "building_name",
    "b"."administration_id",
    "adm"."company_name" AS "administration_company_name",
    COALESCE("ka_agg"."key_count", (0)::bigint) AS "key_count",
    COALESCE("ka_agg"."key_ids", '{}'::"uuid"[]) AS "key_ids",
    COALESCE("ka_agg"."key_labels", '{}'::"text"[]) AS "key_labels"
   FROM ((("operations"."equipment" "e"
     LEFT JOIN "public"."buildings" "b" ON (("b"."id" = "e"."building_id")))
     LEFT JOIN "public"."administrations" "adm" ON (("adm"."id" = "b"."administration_id")))
     LEFT JOIN LATERAL ( SELECT "count"(*) AS "key_count",
            "array_agg"(DISTINCT "ka"."rfid_key_id") AS "key_ids",
            "array_agg"("rk"."rfid_code" ORDER BY "rk"."rfid_code") AS "key_labels"
           FROM ("operations"."key_authorizations" "ka"
             JOIN "public"."rfid_keys" "rk" ON (("rk"."id" = "ka"."rfid_key_id")))
          WHERE (("ka"."equipment_id" = "e"."id") AND ("ka"."sync_state" = 'installed'::"text") AND ("ka"."removed_at" IS NULL))) "ka_agg" ON (true));


ALTER VIEW "public"."equipment_inventory" OWNER TO "postgres";


COMMENT ON VIEW "public"."equipment_inventory" IS 'Read-only inventory surface for operations.equipment. SECURITY INVOKER — base-table RLS applies to caller. Aggregates active key_authorizations into key_count/key_ids/key_labels. Never used as FK target.';



CREATE TABLE IF NOT EXISTS "public"."key_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "key_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "note" "text",
    "actor_staff_id" "uuid",
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "key_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['activated'::"text", 'deactivated'::"text", 'creation_requested'::"text", 'configured'::"text", 'installed'::"text", 'disable_requested'::"text", 'disable_cancelled'::"text", 'disabled'::"text", 'snapshot_skipped'::"text"])))
);


ALTER TABLE "public"."key_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."key_order_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "item_type" "text" DEFAULT 'key'::"text" NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "description" "text",
    "building_id" "uuid" NOT NULL,
    "unit_id" "uuid",
    "unit_price" numeric(12,2) NOT NULL,
    "product_id" "uuid",
    "pickup_particular_id" "uuid",
    "produced_key_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "key_order_items_item_type_check" CHECK (("item_type" = 'key'::"text")),
    CONSTRAINT "key_order_items_quantity_check" CHECK (("quantity" > 0)),
    CONSTRAINT "key_order_items_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'configured'::"text", 'installed'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "key_order_items_unit_price_check" CHECK (("unit_price" > (0)::numeric))
);


ALTER TABLE "public"."key_order_items" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."key_order_number_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."key_order_number_seq" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."key_orders_summary" WITH ("security_invoker"='true') AS
 SELECT "ko"."id",
    "ko"."order_number",
    "ko"."client_type",
    "ko"."administration_id",
    "ko"."particular_id",
    "ko"."particular_full_name",
    "ko"."particular_dni",
    "ko"."particular_phone",
    "ko"."particular_email",
    "ko"."pickup_particular_id",
    "ko"."status",
    "ko"."notes",
    "ko"."created_at",
    "ko"."updated_at",
    "a"."company_name"
   FROM ("public"."key_orders" "ko"
     LEFT JOIN "public"."administrations" "a" ON (("a"."id" = "ko"."administration_id")));


ALTER VIEW "public"."key_orders_summary" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."units" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "building_id" "uuid" NOT NULL,
    "number" "text" NOT NULL,
    "unit_type" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_administrative" boolean DEFAULT false NOT NULL,
    CONSTRAINT "units_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text"])))
);


ALTER TABLE "public"."units" OWNER TO "postgres";


COMMENT ON TABLE "public"."units" IS 'Unidad dentro de un edificio: departamento, local, cochera, o el slot administrativo (is_administrative=true, único por edificio via unique index parcial). El "number" es único dentro de su edificio (dos edificios pueden tener ambos "101"). Toda rfid_key vive en una unit.';



COMMENT ON COLUMN "public"."units"."is_administrative" IS 'Marks the building''s admin-key slot. At most one per building. Administrative keys (portería, mantenimiento, ...) are assigned to this unit; the specific role is noted in rfid_keys.notes.';



CREATE OR REPLACE VIEW "public"."keys_inventory" WITH ("security_invoker"='on') AS
 SELECT "rk"."id",
    "rk"."rfid_code",
    "rk"."status" AS "physical_status",
    "u"."id" AS "unit_id",
    "u"."number" AS "unit_number",
    "b"."id" AS "building_id",
    "b"."name" AS "building_name",
    "adm"."id" AS "administration_id",
    "adm"."company_name" AS "administration_company_name",
    "active_ka"."equipment_id",
    "active_ka"."equipment_serial_number",
    "active_ka"."equipment_model",
    "active_order"."active_order_id",
    "active_order"."active_order_status"
   FROM ((((("public"."rfid_keys" "rk"
     LEFT JOIN "public"."units" "u" ON (("u"."id" = "rk"."unit_id")))
     LEFT JOIN "public"."buildings" "b" ON (("b"."id" = "u"."building_id")))
     LEFT JOIN "public"."administrations" "adm" ON (("adm"."id" = "b"."administration_id")))
     LEFT JOIN LATERAL ( SELECT "ka"."equipment_id",
            "e"."serial_number" AS "equipment_serial_number",
            "e"."model" AS "equipment_model"
           FROM ("operations"."key_authorizations" "ka"
             JOIN "operations"."equipment" "e" ON (("e"."id" = "ka"."equipment_id")))
          WHERE (("ka"."rfid_key_id" = "rk"."id") AND ("ka"."sync_state" = 'installed'::"text") AND ("ka"."removed_at" IS NULL))
          ORDER BY "ka"."installed_at" DESC NULLS LAST
         LIMIT 1) "active_ka" ON (true))
     LEFT JOIN LATERAL ( SELECT "ko"."id" AS "active_order_id",
            "ko"."status" AS "active_order_status"
           FROM ("public"."key_orders" "ko"
             JOIN "public"."key_order_items" "koi" ON (("koi"."order_id" = "ko"."id")))
          WHERE (("koi"."produced_key_id" = "rk"."id") AND ("ko"."status" <> ALL (ARRAY['completed'::"text", 'invoiced'::"text", 'cancelled'::"text"])))
          ORDER BY "ko"."created_at" DESC
         LIMIT 1) "active_order" ON (true));


ALTER VIEW "public"."keys_inventory" OWNER TO "postgres";


COMMENT ON VIEW "public"."keys_inventory" IS 'Read-only inventory surface for rfid_keys. SECURITY INVOKER — base-table RLS applies to caller. Vitalock admin app is single-tenant: all authenticated users are Vitalock staff with full-system read access. RLS boundary is authenticated vs anon only. Projects active key_authorization (sync_state=''installed'') as equipment columns. Projects the latest non-terminal key_order as active_order_id / active_order_status. Never used as a FK target.';



CREATE TABLE IF NOT EXISTS "public"."particulares" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "unit_id" "uuid",
    "dni" "text" NOT NULL,
    "full_name" "text" NOT NULL,
    "phone" "text",
    "email" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    CONSTRAINT "particulares_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text"])))
);


ALTER TABLE "public"."particulares" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "category" "text" NOT NULL,
    "cost_price" numeric(12,2),
    "stock_total" integer DEFAULT 0 NOT NULL,
    "stock_reservado" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "products_category_check" CHECK (("category" = ANY (ARRAY['rfid_key'::"text", 'equipment'::"text"]))),
    CONSTRAINT "products_cost_price_check" CHECK ((("cost_price" IS NULL) OR ("cost_price" >= (0)::numeric))),
    CONSTRAINT "products_name_check" CHECK (("length"(TRIM(BOTH FROM "name")) > 0)),
    CONSTRAINT "products_reservado_le_total" CHECK (("stock_reservado" <= "stock_total")),
    CONSTRAINT "products_stock_reservado_check" CHECK (("stock_reservado" >= 0)),
    CONSTRAINT "products_stock_total_check" CHECK (("stock_total" >= 0))
);


ALTER TABLE "public"."products" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rfid_key_intended_equipment" (
    "rfid_key_id" "uuid" NOT NULL,
    "equipment_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."rfid_key_intended_equipment" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stock_movements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "quantity" integer NOT NULL,
    "unit_cost" numeric(12,2),
    "note" "text",
    "order_id" "uuid",
    "order_item_id" "uuid",
    "ticket_id" "uuid",
    "staff_id" "uuid",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "order_kind" "text",
    CONSTRAINT "stock_movements_order_kind_check" CHECK ((("order_kind" IS NULL) OR ("order_kind" = ANY (ARRAY['key'::"text", 'technical'::"text"])))),
    CONSTRAINT "stock_movements_order_kind_required" CHECK (((("order_id" IS NULL) AND ("order_item_id" IS NULL) AND ("order_kind" IS NULL)) OR ("order_kind" IS NOT NULL))),
    CONSTRAINT "stock_movements_quantity_check" CHECK (("quantity" <> 0)),
    CONSTRAINT "stock_movements_sign_matches_type" CHECK (((("type" = ANY (ARRAY['compra'::"text", 'devolucion'::"text", 'liberacion_reserva'::"text"])) AND ("quantity" > 0)) OR (("type" = ANY (ARRAY['egreso_grabacion'::"text", 'egreso_instalacion'::"text", 'egreso_reemplazo'::"text", 'baja_defectuoso'::"text", 'baja_perdida'::"text", 'reserva'::"text"])) AND ("quantity" < 0)) OR ("type" = 'ajuste_manual'::"text"))),
    CONSTRAINT "stock_movements_type_check" CHECK (("type" = ANY (ARRAY['compra'::"text", 'devolucion'::"text", 'ajuste_manual'::"text", 'egreso_grabacion'::"text", 'egreso_instalacion'::"text", 'egreso_reemplazo'::"text", 'baja_defectuoso'::"text", 'baja_perdida'::"text", 'reserva'::"text", 'liberacion_reserva'::"text"]))),
    CONSTRAINT "stock_movements_unit_cost_check" CHECK ((("unit_cost" IS NULL) OR ("unit_cost" >= (0)::numeric)))
);


ALTER TABLE "public"."stock_movements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."technical_order_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "item_type" "text" NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "description" "text",
    "unit_price" numeric(12,2) NOT NULL,
    "product_id" "uuid",
    "intended_equipment_id" "uuid",
    "intended_assignee_staff_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "building_id" "uuid" NOT NULL,
    "intended_replacement_equipment_id" "uuid",
    CONSTRAINT "technical_order_items_item_type_check" CHECK (("item_type" = ANY (ARRAY['equipment'::"text", 'maintenance'::"text", 'installation'::"text", 'equipment_replacement'::"text"]))),
    CONSTRAINT "technical_order_items_quantity_check" CHECK (("quantity" > 0)),
    CONSTRAINT "technical_order_items_replacement_not_equal_to_target" CHECK ((("intended_replacement_equipment_id" IS NULL) OR ("intended_equipment_id" IS NULL) OR ("intended_replacement_equipment_id" <> "intended_equipment_id"))),
    CONSTRAINT "technical_order_items_replacement_only_for_replacement_type" CHECK ((("intended_replacement_equipment_id" IS NULL) OR ("item_type" = 'equipment_replacement'::"text"))),
    CONSTRAINT "technical_order_items_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'in_progress'::"text", 'completed'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "technical_order_items_unit_price_check" CHECK (("unit_price" > (0)::numeric))
);


ALTER TABLE "public"."technical_order_items" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."technical_order_number_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."technical_order_number_seq" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."technical_orders_summary" WITH ("security_invoker"='true') AS
 SELECT "t"."id",
    "t"."order_number",
    "t"."client_type",
    "t"."administration_id",
    "t"."particular_id",
    "t"."particular_full_name",
    "t"."particular_dni",
    "t"."particular_phone",
    "t"."particular_email",
    "t"."status",
    "t"."notes",
    "t"."created_at",
    "t"."updated_at",
    "a"."company_name"
   FROM ("public"."technical_orders" "t"
     LEFT JOIN "public"."administrations" "a" ON (("a"."id" = "t"."administration_id")));


ALTER VIEW "public"."technical_orders_summary" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "sales"."bills" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "bill_number" "text" DEFAULT "sales"."gen_bill_number"() NOT NULL,
    "administration_id" "uuid" NOT NULL,
    "charge_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "due_date" "date",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "total_amount" numeric(14,2) DEFAULT 0 NOT NULL,
    "currency" "text" DEFAULT 'ARS'::"text" NOT NULL,
    "from_quote_id" "uuid",
    "cancellation_reason" "text",
    "notes" "text",
    "created_by_staff_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "bills_currency_check" CHECK (("currency" = 'ARS'::"text")),
    CONSTRAINT "bills_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'confirmed'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "bills_total_amount_check" CHECK (("total_amount" >= (0)::numeric))
);


ALTER TABLE "sales"."bills" OWNER TO "postgres";


COMMENT ON TABLE "sales"."bills" IS 'Cargo formal a una administración (venta ejecutada). Numeración humana auto: VNT-YYYY-000000. total_amount se recalcula al modificar items. Estado: draft → confirmed → cancelled (cancelled es terminal y no se permite si hay payments). from_quote_id opcional linkea al presupuesto que originó la venta.';



CREATE TABLE IF NOT EXISTS "sales"."payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "administration_id" "uuid" NOT NULL,
    "bill_id" "uuid" NOT NULL,
    "payment_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "amount" numeric(14,2) NOT NULL,
    "currency" "text" DEFAULT 'ARS'::"text" NOT NULL,
    "payment_method" "text" NOT NULL,
    "reference" "text",
    "requires_invoice" boolean NOT NULL,
    "invoiced_at" timestamp with time zone,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "payments_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "payments_currency_check" CHECK (("currency" = 'ARS'::"text")),
    CONSTRAINT "payments_payment_method_check" CHECK (("payment_method" = ANY (ARRAY['cash'::"text", 'transfer'::"text", 'deposit'::"text", 'mercado_pago'::"text", 'check'::"text", 'other'::"text"])))
);


ALTER TABLE "sales"."payments" OWNER TO "postgres";


COMMENT ON TABLE "sales"."payments" IS 'Pago recibido contra una bill. UNIQUE(bill_id): un solo pago por bill (sin pagos parciales por ahora). amount debe ser exactamente igual a bill.total_amount. requires_invoice se autocompleta según payment_method (cash=false, resto=true). invoiced_at lo llena la contadora cuando emite la factura formal externamente.';



CREATE OR REPLACE VIEW "sales"."administration_balance" WITH ("security_invoker"='true') AS
 SELECT "a"."id" AS "administration_id",
    "a"."company_name",
    "a"."tax_id",
    COALESCE("charges"."total", (0)::numeric) AS "total_billed",
    COALESCE("payments"."total", (0)::numeric) AS "total_paid",
    (COALESCE("charges"."total", (0)::numeric) - COALESCE("payments"."total", (0)::numeric)) AS "balance"
   FROM (("public"."administrations" "a"
     LEFT JOIN ( SELECT "bills"."administration_id",
            "sum"("bills"."total_amount") AS "total"
           FROM "sales"."bills"
          WHERE ("bills"."status" = 'confirmed'::"text")
          GROUP BY "bills"."administration_id") "charges" ON (("charges"."administration_id" = "a"."id")))
     LEFT JOIN ( SELECT "payments_1"."administration_id",
            "sum"("payments_1"."amount") AS "total"
           FROM "sales"."payments" "payments_1"
          GROUP BY "payments_1"."administration_id") "payments" ON (("payments"."administration_id" = "a"."id")));


ALTER VIEW "sales"."administration_balance" OWNER TO "postgres";


COMMENT ON VIEW "sales"."administration_balance" IS 'Saldo por administración: total facturado (bills confirmed) menos total cobrado (payments). balance > 0 = la admin debe.';



CREATE TABLE IF NOT EXISTS "sales"."bill_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "bill_id" "uuid" NOT NULL,
    "product_id" "uuid",
    "description" "text" NOT NULL,
    "quantity" numeric(10,2) NOT NULL,
    "unit_price" numeric(14,2) NOT NULL,
    "subtotal" numeric(14,2) DEFAULT 0 NOT NULL,
    "related_key_request_item_id" "uuid",
    "related_equipment_id" "uuid",
    "related_recurring_charge_id" "uuid",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "bill_items_quantity_check" CHECK (("quantity" > (0)::numeric)),
    CONSTRAINT "bill_items_subtotal_check" CHECK (("subtotal" >= (0)::numeric)),
    CONSTRAINT "bill_items_unit_price_check" CHECK (("unit_price" >= (0)::numeric))
);


ALTER TABLE "sales"."bill_items" OWNER TO "postgres";


COMMENT ON TABLE "sales"."bill_items" IS 'Línea de una bill: producto opcional del catálogo + cantidad × precio unitario. Trazabilidad opcional via related_key_request_item_id (llave entregada), related_equipment_id (equipo vendido/instalado) o related_recurring_charge_id (abono mensual generado automáticamente). Solo modificable mientras la bill esté en draft.';



CREATE SEQUENCE IF NOT EXISTS "sales"."bill_number_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "sales"."bill_number_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "sales"."key_request_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "key_request_id" "uuid" NOT NULL,
    "unit_id" "uuid" NOT NULL,
    "quantity" integer NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "key_request_items_quantity_check" CHECK (("quantity" > 0))
);


ALTER TABLE "sales"."key_request_items" OWNER TO "postgres";


COMMENT ON TABLE "sales"."key_request_items" IS 'Línea de un key_request: cuántas llaves para qué unit. La unit debe pertenecer a un edificio de la administración del request. quantity no puede reducirse por debajo del número de rfid_keys ya producidas contra esta línea. Cada rfid_key producida se linkea a esta línea via key_request_item_id.';



CREATE SEQUENCE IF NOT EXISTS "sales"."key_request_number_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "sales"."key_request_number_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "sales"."key_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "request_number" "text" DEFAULT "sales"."gen_key_request_number"() NOT NULL,
    "administration_id" "uuid" NOT NULL,
    "requester_type" "text" NOT NULL,
    "requester_name" "text",
    "requester_surname" "text",
    "requester_dni" "text",
    "requester_contact" "text",
    "pickup_person_name" "text",
    "pickup_person_surname" "text",
    "pickup_person_dni" "text",
    "status" "text" DEFAULT 'pending_authorization'::"text" NOT NULL,
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "received_by_staff_id" "uuid",
    "authorized_by" "text",
    "authorized_at" timestamp with time zone,
    "authorization_method" "text",
    "rejection_reason" "text",
    "rejection_notes" "text",
    "cancellation_reason" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "requester_particular_id" "uuid",
    "pickup_particular_id" "uuid",
    CONSTRAINT "key_requests_authorization_method_check" CHECK (("authorization_method" = ANY (ARRAY['whatsapp'::"text", 'email'::"text", 'phone'::"text", 'in_person'::"text", 'self'::"text"]))),
    CONSTRAINT "key_requests_rejection_reason_check" CHECK (("rejection_reason" = ANY (ARRAY['not_authorized_by_administration'::"text", 'data_mismatch'::"text", 'security_concern'::"text", 'other'::"text"]))),
    CONSTRAINT "key_requests_requester_type_check" CHECK (("requester_type" = ANY (ARRAY['administration'::"text", 'individual'::"text"]))),
    CONSTRAINT "key_requests_status_check" CHECK (("status" = ANY (ARRAY['pending_authorization'::"text", 'authorized'::"text", 'in_production'::"text", 'ready_for_pickup'::"text", 'delivered'::"text", 'rejected'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "sales"."key_requests" OWNER TO "postgres";


COMMENT ON TABLE "sales"."key_requests" IS 'Pedido de llaves entrante por WhatsApp / mail / teléfono. requester_type diferencia auto-autorización (administration) de necesidad de confirmar con la admin (individual). pickup_person_* (nombre, apellido, DNI) es inmutable desde que status pasa a authorized — es la garantía de seguridad de que solo esa persona puede retirar. Estados avanzan solos via triggers sobre rfid_keys (production + pickup).';



CREATE OR REPLACE VIEW "sales"."pending_to_invoice" WITH ("security_invoker"='true') AS
 SELECT "p"."id" AS "payment_id",
    "p"."payment_date",
    "p"."amount",
    "p"."payment_method",
    "p"."reference",
    "b"."bill_number",
    "b"."charge_date",
    "a"."id" AS "administration_id",
    "a"."company_name",
    "a"."tax_id"
   FROM (("sales"."payments" "p"
     JOIN "sales"."bills" "b" ON (("b"."id" = "p"."bill_id")))
     JOIN "public"."administrations" "a" ON (("a"."id" = "p"."administration_id")))
  WHERE (("p"."requires_invoice" = true) AND ("p"."invoiced_at" IS NULL));


ALTER VIEW "sales"."pending_to_invoice" OWNER TO "postgres";


COMMENT ON VIEW "sales"."pending_to_invoice" IS 'Pagos por transferencia/depósito/MP/cheque que aún no fueron facturados por la contadora. Se marca como facturado seteando payments.invoiced_at.';



CREATE TABLE IF NOT EXISTS "sales"."products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "product_type" "text" NOT NULL,
    "description" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "products_product_type_check" CHECK (("product_type" = ANY (ARRAY['rfid_key'::"text", 'equipment'::"text", 'installation'::"text", 'maintenance_recurring'::"text", 'maintenance_one_time'::"text", 'equipment_replacement'::"text", 'cctv_wifi_installation'::"text", 'other'::"text"])))
);


ALTER TABLE "sales"."products" OWNER TO "postgres";


COMMENT ON TABLE "sales"."products" IS 'Catálogo tipológico de lo que Vitalock vende. Sin precio fijo — el precio se ingresa por venta porque cambia con inflación y negociación. product_type acota categorías (rfid_key, equipment, installation, etc.); is_active permite discontinuar sin borrar. Productos inactivos no se pueden referenciar en nuevos items pero mantienen sus referencias históricas intactas.';



CREATE TABLE IF NOT EXISTS "sales"."quote_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "quote_id" "uuid" NOT NULL,
    "product_id" "uuid",
    "description" "text" NOT NULL,
    "quantity" numeric(10,2) NOT NULL,
    "unit_price" numeric(14,2) NOT NULL,
    "subtotal" numeric(14,2) DEFAULT 0 NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "quote_items_quantity_check" CHECK (("quantity" > (0)::numeric)),
    CONSTRAINT "quote_items_subtotal_check" CHECK (("subtotal" >= (0)::numeric)),
    CONSTRAINT "quote_items_unit_price_check" CHECK (("unit_price" >= (0)::numeric))
);


ALTER TABLE "sales"."quote_items" OWNER TO "postgres";


COMMENT ON TABLE "sales"."quote_items" IS 'Línea de un quote: descripción libre + producto opcional del catálogo + cantidad × precio unitario. subtotal se calcula solo. quote_id y unit_id no se pueden modificar; el resto es libre mientras el quote esté en draft.';



CREATE SEQUENCE IF NOT EXISTS "sales"."quote_number_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "sales"."quote_number_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "sales"."quotes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "quote_number" "text" DEFAULT "sales"."gen_quote_number"() NOT NULL,
    "administration_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "valid_until" "date",
    "total_amount" numeric(14,2) DEFAULT 0 NOT NULL,
    "currency" "text" DEFAULT 'ARS'::"text" NOT NULL,
    "sent_at" timestamp with time zone,
    "accepted_at" timestamp with time zone,
    "rejected_at" timestamp with time zone,
    "rejection_reason" "text",
    "created_by_staff_id" "uuid",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "quotes_currency_check" CHECK (("currency" = 'ARS'::"text")),
    CONSTRAINT "quotes_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'sent'::"text", 'accepted'::"text", 'rejected'::"text", 'expired'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "quotes_total_amount_check" CHECK (("total_amount" >= (0)::numeric))
);


ALTER TABLE "sales"."quotes" OWNER TO "postgres";


COMMENT ON TABLE "sales"."quotes" IS 'Presupuesto formal a un cliente (típicamente instalaciones). Estado: draft → sent → accepted/rejected/expired/cancelled. total_amount se recalcula solo cuando cambian los items. Items solo modificables en draft. Si se acepta, se crea una bill con from_quote_id apuntando al quote.';



CREATE TABLE IF NOT EXISTS "sales"."recurring_charges" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "administration_id" "uuid" NOT NULL,
    "product_id" "uuid",
    "description" "text" NOT NULL,
    "monthly_amount" numeric(14,2) NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date",
    "is_active" boolean DEFAULT true NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "recurring_charges_monthly_amount_check" CHECK (("monthly_amount" > (0)::numeric)),
    CONSTRAINT "recurring_charges_valid_period" CHECK ((("end_date" IS NULL) OR ("end_date" >= "start_date")))
);


ALTER TABLE "sales"."recurring_charges" OWNER TO "postgres";


COMMENT ON TABLE "sales"."recurring_charges" IS 'Configuración de abono mensual por administración (típicamente mantenimiento). La función sales.generate_recurring_charges(year, month) crea las bills del mes evitando duplicados via el link bill_items.related_recurring_charge_id. is_active=false pausa la generación sin borrar la configuración.';



CREATE TABLE IF NOT EXISTS "support"."equipment_updates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ticket_id" "uuid" NOT NULL,
    "equipment_id" "uuid" NOT NULL,
    "mdb_storage_path" "text" NOT NULL,
    "keys_to_activate" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "keys_to_disable" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by_staff_id" "uuid",
    "resolved_at" timestamp with time zone,
    "resolved_by_staff_id" "uuid",
    CONSTRAINT "equipment_updates_snapshot_nonempty" CHECK ((("cardinality"("keys_to_activate") + "cardinality"("keys_to_disable")) > 0))
);


ALTER TABLE "support"."equipment_updates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "support"."tickets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ticket_number" "text" DEFAULT "support"."gen_ticket_number"() NOT NULL,
    "administration_id" "uuid" NOT NULL,
    "building_id" "uuid" NOT NULL,
    "unit_id" "uuid",
    "equipment_id" "uuid",
    "category" "text" NOT NULL,
    "description" "text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "related_bill_id" "uuid",
    "related_key_request_id" "uuid",
    "opened_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "opened_by_staff_id" "uuid",
    "assigned_to_staff_id" "uuid",
    "resolved_at" timestamp with time zone,
    "resolved_by_staff_id" "uuid",
    "resolution_notes" "text",
    "cancellation_reason" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "key_order_item_id" "uuid",
    "technical_order_item_id" "uuid",
    "pending_new_serial" "text",
    "pending_new_model" "text",
    CONSTRAINT "tickets_category_check" CHECK (("category" = ANY (ARRAY['maintenance'::"text", 'installation'::"text", 'key_configuration'::"text", 'key_installation'::"text", 'equipment_installation'::"text", 'equipment_replacement'::"text", 'equipment_update'::"text"]))),
    CONSTRAINT "tickets_order_item_xor_check" CHECK ((NOT (("key_order_item_id" IS NOT NULL) AND ("technical_order_item_id" IS NOT NULL)))),
    CONSTRAINT "tickets_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'in_progress'::"text", 'resolved'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "support"."tickets" OWNER TO "postgres";


COMMENT ON TABLE "support"."tickets" IS 'Ticket de soporte (mantenimiento o instalación) atado a administración + edificio; opcionalmente a unit y/o equipment. Estados: open → in_progress → resolved, con reapertura resolved → in_progress y cancelled desde cualquiera. Auto-transición: ticket in_progress + equipment_id + category=maintenance marca automáticamente el equipo como maintenance. related_bill_id linkea al cargo si el trabajo se factura por evento (NULL si está cubierto por abono mensual).';



COMMENT ON COLUMN "support"."tickets"."pending_new_serial" IS 'Operator-supplied serial for the equipment to be created/swapped at resolve time. Only meaningful when category in (equipment_installation, equipment_replacement). Written by configure_technical_ticket_equipment.';



COMMENT ON COLUMN "support"."tickets"."pending_new_model" IS 'Optional operator-supplied model. When null at resolve time, defaults to the product name of the associated technical_order_item.';



CREATE OR REPLACE VIEW "support"."installer_tickets_with_context" WITH ("security_invoker"='true') AS
 SELECT "t"."id",
    "t"."ticket_number",
    "t"."administration_id",
    "t"."building_id",
    "t"."unit_id",
    "t"."equipment_id",
    "t"."category",
    "t"."description",
    "t"."status",
    "t"."related_bill_id",
    "t"."related_key_request_id",
    "t"."opened_at",
    "t"."opened_by_staff_id",
    "t"."assigned_to_staff_id",
    "t"."resolved_at",
    "t"."resolved_by_staff_id",
    "t"."resolution_notes",
    "t"."cancellation_reason",
    "t"."notes",
    "t"."created_at",
    "t"."updated_at",
    "t"."key_order_item_id",
    "t"."technical_order_item_id",
    "t"."pending_new_serial",
    "t"."pending_new_model",
    "b"."name" AS "building_name",
    "b"."address" AS "building_address",
    "b"."city" AS "building_city",
    "b"."administration_id" AS "building_administration_id",
    "a"."company_name" AS "administration_company_name",
    "a"."address" AS "administration_address"
   FROM (("support"."tickets" "t"
     LEFT JOIN "public"."buildings" "b" ON (("b"."id" = "t"."building_id")))
     LEFT JOIN "public"."administrations" "a" ON (("a"."id" = "b"."administration_id")));


ALTER VIEW "support"."installer_tickets_with_context" OWNER TO "postgres";


CREATE OR REPLACE VIEW "support"."technical_order_tickets" WITH ("security_invoker"='true') AS
 SELECT "t"."id",
    "t"."ticket_number",
    "t"."category",
    "t"."status",
    "t"."description",
    "t"."technical_order_item_id",
    "t"."assigned_to_staff_id",
    "t"."created_at",
    "t"."resolved_at",
    "toi"."order_id" AS "technical_order_id"
   FROM ("support"."tickets" "t"
     LEFT JOIN "public"."technical_order_items" "toi" ON (("toi"."id" = "t"."technical_order_item_id")));


ALTER VIEW "support"."technical_order_tickets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "support"."ticket_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ticket_id" "uuid" NOT NULL,
    "author_staff_id" "uuid",
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "support"."ticket_comments" OWNER TO "postgres";


COMMENT ON TABLE "support"."ticket_comments" IS 'Timeline de comentarios internos del ticket, append-only por diseño: los triggers rechazan UPDATE y DELETE (incluso via CASCADE — hace que los tickets tampoco se puedan borrar). Si hay que corregir un comentario previo, se agrega uno nuevo aclarándolo.';



CREATE SEQUENCE IF NOT EXISTS "support"."ticket_number_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "support"."ticket_number_seq" OWNER TO "postgres";


ALTER TABLE ONLY "identity"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "identity"."staff"
    ADD CONSTRAINT "staff_auth_user_id_key" UNIQUE ("auth_user_id");



ALTER TABLE ONLY "identity"."staff"
    ADD CONSTRAINT "staff_email_key" UNIQUE ("email");



ALTER TABLE ONLY "identity"."staff"
    ADD CONSTRAINT "staff_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "operations"."equipment"
    ADD CONSTRAINT "equipment_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "operations"."equipment"
    ADD CONSTRAINT "equipment_serial_number_key" UNIQUE ("serial_number");



ALTER TABLE ONLY "operations"."key_authorizations"
    ADD CONSTRAINT "key_authorizations_key_equipment_unique" UNIQUE ("rfid_key_id", "equipment_id");



ALTER TABLE ONLY "operations"."key_authorizations"
    ADD CONSTRAINT "key_authorizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."administrations"
    ADD CONSTRAINT "administrations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."administrations"
    ADD CONSTRAINT "administrations_tax_id_key" UNIQUE ("tax_id");



ALTER TABLE ONLY "public"."buildings"
    ADD CONSTRAINT "buildings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."key_events"
    ADD CONSTRAINT "key_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."key_order_items"
    ADD CONSTRAINT "key_order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."key_orders"
    ADD CONSTRAINT "key_orders_order_number_key" UNIQUE ("order_number");



ALTER TABLE ONLY "public"."key_orders"
    ADD CONSTRAINT "key_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."particulares"
    ADD CONSTRAINT "particulares_dni_key" UNIQUE ("dni");



ALTER TABLE ONLY "public"."particulares"
    ADD CONSTRAINT "particulares_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."particulares"
    ADD CONSTRAINT "particulares_unit_id_key" UNIQUE ("unit_id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rfid_key_intended_equipment"
    ADD CONSTRAINT "rfid_key_intended_equipment_pkey" PRIMARY KEY ("rfid_key_id", "equipment_id");



ALTER TABLE ONLY "public"."rfid_keys"
    ADD CONSTRAINT "rfid_keys_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rfid_keys"
    ADD CONSTRAINT "rfid_keys_rfid_code_key" UNIQUE ("rfid_code");



ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."technical_order_items"
    ADD CONSTRAINT "technical_order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."technical_orders"
    ADD CONSTRAINT "technical_orders_order_number_key" UNIQUE ("order_number");



ALTER TABLE ONLY "public"."technical_orders"
    ADD CONSTRAINT "technical_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."units"
    ADD CONSTRAINT "units_building_number_unique" UNIQUE ("building_id", "number");



ALTER TABLE ONLY "public"."units"
    ADD CONSTRAINT "units_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "sales"."bill_items"
    ADD CONSTRAINT "bill_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "sales"."bills"
    ADD CONSTRAINT "bills_bill_number_key" UNIQUE ("bill_number");



ALTER TABLE ONLY "sales"."bills"
    ADD CONSTRAINT "bills_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "sales"."key_request_items"
    ADD CONSTRAINT "key_request_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "sales"."key_requests"
    ADD CONSTRAINT "key_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "sales"."key_requests"
    ADD CONSTRAINT "key_requests_request_number_key" UNIQUE ("request_number");



ALTER TABLE ONLY "sales"."payments"
    ADD CONSTRAINT "payments_bill_id_key" UNIQUE ("bill_id");



ALTER TABLE ONLY "sales"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "sales"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "sales"."quote_items"
    ADD CONSTRAINT "quote_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "sales"."quotes"
    ADD CONSTRAINT "quotes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "sales"."quotes"
    ADD CONSTRAINT "quotes_quote_number_key" UNIQUE ("quote_number");



ALTER TABLE ONLY "sales"."recurring_charges"
    ADD CONSTRAINT "recurring_charges_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "support"."equipment_updates"
    ADD CONSTRAINT "equipment_updates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "support"."equipment_updates"
    ADD CONSTRAINT "equipment_updates_ticket_id_key" UNIQUE ("ticket_id");



ALTER TABLE ONLY "support"."ticket_comments"
    ADD CONSTRAINT "ticket_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "support"."tickets"
    ADD CONSTRAINT "tickets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "support"."tickets"
    ADD CONSTRAINT "tickets_ticket_number_key" UNIQUE ("ticket_number");



CREATE INDEX "audit_log_event_idx" ON "identity"."audit_log" USING "btree" ("event_type", "occurred_at" DESC);



CREATE INDEX "audit_log_subject_idx" ON "identity"."audit_log" USING "btree" ("subject_id", "occurred_at" DESC);



CREATE INDEX "staff_role_idx" ON "identity"."staff" USING "btree" ("role");



CREATE INDEX "equipment_building_id_idx" ON "operations"."equipment" USING "btree" ("building_id");



CREATE INDEX "equipment_replaces_equipment_id_idx" ON "operations"."equipment" USING "btree" ("replaces_equipment_id");



CREATE INDEX "equipment_status_idx" ON "operations"."equipment" USING "btree" ("status");



CREATE INDEX "key_authorizations_equipment_id_idx" ON "operations"."key_authorizations" USING "btree" ("equipment_id");



CREATE INDEX "key_authorizations_equipment_pending_idx" ON "operations"."key_authorizations" USING "btree" ("equipment_id", "sync_state") WHERE ("sync_state" = ANY (ARRAY['pending_install'::"text", 'pending_removal'::"text"]));



CREATE INDEX "key_authorizations_installed_by_staff_id_idx" ON "operations"."key_authorizations" USING "btree" ("installed_by_staff_id") WHERE ("installed_by_staff_id" IS NOT NULL);



CREATE INDEX "key_authorizations_removed_by_staff_id_idx" ON "operations"."key_authorizations" USING "btree" ("removed_by_staff_id") WHERE ("removed_by_staff_id" IS NOT NULL);



CREATE INDEX "key_authorizations_rfid_key_id_idx" ON "operations"."key_authorizations" USING "btree" ("rfid_key_id");



CREATE INDEX "key_authorizations_sync_state_idx" ON "operations"."key_authorizations" USING "btree" ("sync_state");



CREATE INDEX "administrations_company_name_trgm_idx" ON "public"."administrations" USING "gin" ("company_name" "extensions"."gin_trgm_ops");



CREATE INDEX "buildings_administration_id_idx" ON "public"."buildings" USING "btree" ("administration_id");



CREATE INDEX "key_events_key_id_idx" ON "public"."key_events" USING "btree" ("key_id");



CREATE INDEX "key_events_occurred_at_idx" ON "public"."key_events" USING "btree" ("occurred_at" DESC);



CREATE INDEX "key_order_items_building_id_idx" ON "public"."key_order_items" USING "btree" ("building_id");



CREATE INDEX "key_order_items_order_id_idx" ON "public"."key_order_items" USING "btree" ("order_id");



CREATE INDEX "key_order_items_product_id_idx" ON "public"."key_order_items" USING "btree" ("product_id") WHERE ("product_id" IS NOT NULL);



CREATE INDEX "key_order_items_status_idx" ON "public"."key_order_items" USING "btree" ("status");



CREATE INDEX "key_orders_administration_id_idx" ON "public"."key_orders" USING "btree" ("administration_id") WHERE ("administration_id" IS NOT NULL);



CREATE INDEX "key_orders_created_at_idx" ON "public"."key_orders" USING "btree" ("created_at" DESC);



CREATE INDEX "key_orders_order_number_idx" ON "public"."key_orders" USING "btree" ("order_number");



CREATE INDEX "key_orders_particular_id_idx" ON "public"."key_orders" USING "btree" ("particular_id") WHERE ("particular_id" IS NOT NULL);



CREATE INDEX "key_orders_status_idx" ON "public"."key_orders" USING "btree" ("status");



CREATE INDEX "products_category_idx" ON "public"."products" USING "btree" ("category");



CREATE UNIQUE INDEX "products_name_category_uidx" ON "public"."products" USING "btree" ("category", "lower"(TRIM(BOTH FROM "name")));



CREATE INDEX "rfid_key_intended_equipment_equipment_id_idx" ON "public"."rfid_key_intended_equipment" USING "btree" ("equipment_id");



CREATE INDEX "rfid_key_intended_equipment_key_id_idx" ON "public"."rfid_key_intended_equipment" USING "btree" ("rfid_key_id");



CREATE INDEX "rfid_keys_delivered_by_staff_id_idx" ON "public"."rfid_keys" USING "btree" ("delivered_by_staff_id") WHERE ("delivered_by_staff_id" IS NOT NULL);



CREATE INDEX "rfid_keys_key_request_item_id_idx" ON "public"."rfid_keys" USING "btree" ("key_request_item_id");



CREATE INDEX "rfid_keys_order_item_id_idx" ON "public"."rfid_keys" USING "btree" ("order_item_id") WHERE ("order_item_id" IS NOT NULL);



CREATE INDEX "rfid_keys_picked_up_at_idx" ON "public"."rfid_keys" USING "btree" ("picked_up_at") WHERE ("picked_up_at" IS NOT NULL);



CREATE INDEX "rfid_keys_status_idx" ON "public"."rfid_keys" USING "btree" ("status");



CREATE INDEX "rfid_keys_unit_id_idx" ON "public"."rfid_keys" USING "btree" ("unit_id");



CREATE INDEX "stock_movements_order_item_idx" ON "public"."stock_movements" USING "btree" ("order_item_id") WHERE ("order_item_id" IS NOT NULL);



CREATE INDEX "stock_movements_order_kind_order_id_idx" ON "public"."stock_movements" USING "btree" ("order_kind", "order_id") WHERE ("order_id" IS NOT NULL);



CREATE INDEX "stock_movements_product_idx" ON "public"."stock_movements" USING "btree" ("product_id");



CREATE UNIQUE INDEX "stock_movements_reserva_unique" ON "public"."stock_movements" USING "btree" ("order_item_id", "type") WHERE (("type" = 'reserva'::"text") AND ("order_item_id" IS NOT NULL));



CREATE INDEX "stock_movements_ticket_idx" ON "public"."stock_movements" USING "btree" ("ticket_id") WHERE ("ticket_id" IS NOT NULL);



CREATE INDEX "technical_order_items_building_id_idx" ON "public"."technical_order_items" USING "btree" ("building_id");



CREATE INDEX "technical_order_items_intended_assignee_staff_id_idx" ON "public"."technical_order_items" USING "btree" ("intended_assignee_staff_id") WHERE ("intended_assignee_staff_id" IS NOT NULL);



CREATE INDEX "technical_order_items_intended_equipment_id_idx" ON "public"."technical_order_items" USING "btree" ("intended_equipment_id") WHERE ("intended_equipment_id" IS NOT NULL);



CREATE INDEX "technical_order_items_intended_replacement_equipment_id_idx" ON "public"."technical_order_items" USING "btree" ("intended_replacement_equipment_id") WHERE ("intended_replacement_equipment_id" IS NOT NULL);



CREATE INDEX "technical_order_items_order_id_idx" ON "public"."technical_order_items" USING "btree" ("order_id");



CREATE INDEX "technical_order_items_product_id_idx" ON "public"."technical_order_items" USING "btree" ("product_id") WHERE ("product_id" IS NOT NULL);



CREATE INDEX "technical_order_items_status_idx" ON "public"."technical_order_items" USING "btree" ("status");



CREATE INDEX "technical_orders_administration_id_idx" ON "public"."technical_orders" USING "btree" ("administration_id") WHERE ("administration_id" IS NOT NULL);



CREATE INDEX "technical_orders_created_at_idx" ON "public"."technical_orders" USING "btree" ("created_at" DESC);



CREATE INDEX "technical_orders_order_number_idx" ON "public"."technical_orders" USING "btree" ("order_number");



CREATE INDEX "technical_orders_particular_id_idx" ON "public"."technical_orders" USING "btree" ("particular_id") WHERE ("particular_id" IS NOT NULL);



CREATE INDEX "technical_orders_status_idx" ON "public"."technical_orders" USING "btree" ("status");



CREATE INDEX "units_building_id_idx" ON "public"."units" USING "btree" ("building_id");



CREATE UNIQUE INDEX "units_one_admin_per_building_idx" ON "public"."units" USING "btree" ("building_id") WHERE ("is_administrative" = true);



CREATE INDEX "bill_items_bill_id_idx" ON "sales"."bill_items" USING "btree" ("bill_id");



CREATE INDEX "bill_items_product_id_idx" ON "sales"."bill_items" USING "btree" ("product_id") WHERE ("product_id" IS NOT NULL);



CREATE INDEX "bill_items_related_equipment_idx" ON "sales"."bill_items" USING "btree" ("related_equipment_id") WHERE ("related_equipment_id" IS NOT NULL);



CREATE INDEX "bill_items_related_key_request_item_idx" ON "sales"."bill_items" USING "btree" ("related_key_request_item_id") WHERE ("related_key_request_item_id" IS NOT NULL);



CREATE INDEX "bill_items_related_recurring_charge_idx" ON "sales"."bill_items" USING "btree" ("related_recurring_charge_id") WHERE ("related_recurring_charge_id" IS NOT NULL);



CREATE INDEX "bills_administration_id_idx" ON "sales"."bills" USING "btree" ("administration_id");



CREATE INDEX "bills_charge_date_idx" ON "sales"."bills" USING "btree" ("charge_date");



CREATE INDEX "bills_created_by_staff_id_idx" ON "sales"."bills" USING "btree" ("created_by_staff_id") WHERE ("created_by_staff_id" IS NOT NULL);



CREATE INDEX "bills_from_quote_id_idx" ON "sales"."bills" USING "btree" ("from_quote_id") WHERE ("from_quote_id" IS NOT NULL);



CREATE INDEX "bills_status_idx" ON "sales"."bills" USING "btree" ("status");



CREATE INDEX "key_request_items_key_request_id_idx" ON "sales"."key_request_items" USING "btree" ("key_request_id");



CREATE INDEX "key_request_items_unit_id_idx" ON "sales"."key_request_items" USING "btree" ("unit_id");



CREATE INDEX "key_requests_administration_id_idx" ON "sales"."key_requests" USING "btree" ("administration_id");



CREATE INDEX "key_requests_pickup_particular_id_idx" ON "sales"."key_requests" USING "btree" ("pickup_particular_id") WHERE ("pickup_particular_id" IS NOT NULL);



CREATE INDEX "key_requests_received_at_idx" ON "sales"."key_requests" USING "btree" ("received_at");



CREATE INDEX "key_requests_received_by_staff_id_idx" ON "sales"."key_requests" USING "btree" ("received_by_staff_id") WHERE ("received_by_staff_id" IS NOT NULL);



CREATE INDEX "key_requests_requester_particular_id_idx" ON "sales"."key_requests" USING "btree" ("requester_particular_id") WHERE ("requester_particular_id" IS NOT NULL);



CREATE INDEX "key_requests_status_idx" ON "sales"."key_requests" USING "btree" ("status");



CREATE INDEX "payments_administration_id_idx" ON "sales"."payments" USING "btree" ("administration_id");



CREATE INDEX "payments_payment_date_idx" ON "sales"."payments" USING "btree" ("payment_date");



CREATE INDEX "payments_pending_invoice_idx" ON "sales"."payments" USING "btree" ("administration_id", "payment_date") WHERE (("requires_invoice" = true) AND ("invoiced_at" IS NULL));



CREATE INDEX "products_is_active_idx" ON "sales"."products" USING "btree" ("is_active") WHERE "is_active";



CREATE INDEX "products_product_type_idx" ON "sales"."products" USING "btree" ("product_type");



CREATE INDEX "quote_items_product_id_idx" ON "sales"."quote_items" USING "btree" ("product_id") WHERE ("product_id" IS NOT NULL);



CREATE INDEX "quote_items_quote_id_idx" ON "sales"."quote_items" USING "btree" ("quote_id");



CREATE INDEX "quotes_administration_id_idx" ON "sales"."quotes" USING "btree" ("administration_id");



CREATE INDEX "quotes_created_by_staff_id_idx" ON "sales"."quotes" USING "btree" ("created_by_staff_id") WHERE ("created_by_staff_id" IS NOT NULL);



CREATE INDEX "quotes_status_idx" ON "sales"."quotes" USING "btree" ("status");



CREATE INDEX "recurring_charges_administration_id_idx" ON "sales"."recurring_charges" USING "btree" ("administration_id");



CREATE INDEX "recurring_charges_is_active_idx" ON "sales"."recurring_charges" USING "btree" ("is_active") WHERE "is_active";



CREATE INDEX "recurring_charges_product_id_idx" ON "sales"."recurring_charges" USING "btree" ("product_id") WHERE ("product_id" IS NOT NULL);



CREATE INDEX "equipment_updates_equipment_id_idx" ON "support"."equipment_updates" USING "btree" ("equipment_id");



CREATE UNIQUE INDEX "equipment_updates_one_open_per_equipment_uidx" ON "support"."equipment_updates" USING "btree" ("equipment_id") WHERE ("resolved_at" IS NULL);



CREATE INDEX "equipment_updates_ticket_id_idx" ON "support"."equipment_updates" USING "btree" ("ticket_id");



CREATE INDEX "ticket_comments_author_staff_id_idx" ON "support"."ticket_comments" USING "btree" ("author_staff_id") WHERE ("author_staff_id" IS NOT NULL);



CREATE INDEX "ticket_comments_ticket_id_idx" ON "support"."ticket_comments" USING "btree" ("ticket_id");



CREATE INDEX "tickets_administration_id_idx" ON "support"."tickets" USING "btree" ("administration_id");



CREATE INDEX "tickets_assigned_to_staff_id_idx" ON "support"."tickets" USING "btree" ("assigned_to_staff_id") WHERE ("assigned_to_staff_id" IS NOT NULL);



CREATE INDEX "tickets_building_id_idx" ON "support"."tickets" USING "btree" ("building_id");



CREATE INDEX "tickets_equipment_id_idx" ON "support"."tickets" USING "btree" ("equipment_id") WHERE ("equipment_id" IS NOT NULL);



CREATE INDEX "tickets_key_order_item_id_idx" ON "support"."tickets" USING "btree" ("key_order_item_id") WHERE ("key_order_item_id" IS NOT NULL);



CREATE INDEX "tickets_open_assigned_idx" ON "support"."tickets" USING "btree" ("assigned_to_staff_id", "status") WHERE ("status" = ANY (ARRAY['open'::"text", 'in_progress'::"text"]));



CREATE INDEX "tickets_opened_by_staff_id_idx" ON "support"."tickets" USING "btree" ("opened_by_staff_id") WHERE ("opened_by_staff_id" IS NOT NULL);



CREATE INDEX "tickets_related_bill_id_idx" ON "support"."tickets" USING "btree" ("related_bill_id") WHERE ("related_bill_id" IS NOT NULL);



CREATE INDEX "tickets_related_key_request_id_idx" ON "support"."tickets" USING "btree" ("related_key_request_id") WHERE ("related_key_request_id" IS NOT NULL);



CREATE INDEX "tickets_resolved_by_staff_id_idx" ON "support"."tickets" USING "btree" ("resolved_by_staff_id") WHERE ("resolved_by_staff_id" IS NOT NULL);



CREATE INDEX "tickets_status_idx" ON "support"."tickets" USING "btree" ("status");



CREATE INDEX "tickets_technical_order_item_id_idx" ON "support"."tickets" USING "btree" ("technical_order_item_id") WHERE ("technical_order_item_id" IS NOT NULL);



CREATE INDEX "tickets_unit_id_idx" ON "support"."tickets" USING "btree" ("unit_id") WHERE ("unit_id" IS NOT NULL);



CREATE OR REPLACE TRIGGER "staff_audit_delete" AFTER DELETE ON "identity"."staff" FOR EACH ROW EXECUTE FUNCTION "identity"."record_staff_audit_event"();



CREATE OR REPLACE TRIGGER "staff_audit_insert" AFTER INSERT ON "identity"."staff" FOR EACH ROW EXECUTE FUNCTION "identity"."record_staff_audit_event"();



CREATE OR REPLACE TRIGGER "staff_audit_update" AFTER UPDATE ON "identity"."staff" FOR EACH ROW EXECUTE FUNCTION "identity"."record_staff_audit_event"();



CREATE OR REPLACE TRIGGER "staff_set_updated_at" BEFORE UPDATE ON "identity"."staff" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "equipment_close_authorizations_on_dead" AFTER UPDATE OF "status" ON "operations"."equipment" FOR EACH ROW EXECUTE FUNCTION "operations"."equipment_close_authorizations_on_dead"();



CREATE OR REPLACE TRIGGER "equipment_prevent_reassignment" BEFORE UPDATE ON "operations"."equipment" FOR EACH ROW EXECUTE FUNCTION "operations"."equipment_prevent_reassignment"();



CREATE OR REPLACE TRIGGER "equipment_set_updated_at" BEFORE UPDATE ON "operations"."equipment" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "equipment_sync_decommissioned_at" BEFORE INSERT OR UPDATE ON "operations"."equipment" FOR EACH ROW EXECUTE FUNCTION "operations"."equipment_sync_decommissioned_at"();



CREATE OR REPLACE TRIGGER "equipment_validate_replacement" BEFORE INSERT ON "operations"."equipment" FOR EACH ROW EXECUTE FUNCTION "operations"."equipment_validate_replacement"();



CREATE OR REPLACE TRIGGER "equipment_validate_status_transition" BEFORE UPDATE OF "status" ON "operations"."equipment" FOR EACH ROW EXECUTE FUNCTION "operations"."equipment_validate_status_transition"();



CREATE OR REPLACE TRIGGER "key_authorizations_enforce_installer_columns" BEFORE UPDATE ON "operations"."key_authorizations" FOR EACH ROW EXECUTE FUNCTION "operations"."enforce_installer_key_auth_column_restrictions"();



CREATE OR REPLACE TRIGGER "key_authorizations_prevent_reassignment" BEFORE UPDATE ON "operations"."key_authorizations" FOR EACH ROW EXECUTE FUNCTION "operations"."key_authorizations_prevent_reassignment"();



CREATE OR REPLACE TRIGGER "key_authorizations_set_updated_at" BEFORE UPDATE ON "operations"."key_authorizations" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "key_authorizations_sync_timestamps" BEFORE UPDATE ON "operations"."key_authorizations" FOR EACH ROW EXECUTE FUNCTION "operations"."key_authorizations_sync_timestamps"();



CREATE OR REPLACE TRIGGER "key_authorizations_validate" BEFORE INSERT OR UPDATE ON "operations"."key_authorizations" FOR EACH ROW EXECUTE FUNCTION "operations"."key_authorizations_validate"();



CREATE OR REPLACE TRIGGER "administrations_set_updated_at" BEFORE UPDATE ON "public"."administrations" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "buildings_set_updated_at" BEFORE UPDATE ON "public"."buildings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "key_order_items_recompute_order_status_trigger" AFTER UPDATE OF "status" ON "public"."key_order_items" FOR EACH ROW EXECUTE FUNCTION "public"."key_order_items_recompute_order_status"();



CREATE OR REPLACE TRIGGER "key_order_items_set_updated_at" BEFORE UPDATE ON "public"."key_order_items" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "key_orders_cancel_release_reservations_trigger" AFTER UPDATE ON "public"."key_orders" FOR EACH ROW EXECUTE FUNCTION "public"."key_orders_cancel_release_reservations"();



CREATE OR REPLACE TRIGGER "key_orders_set_updated_at" BEFORE UPDATE ON "public"."key_orders" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "particulares_set_updated_at" BEFORE UPDATE ON "public"."particulares" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "products_set_updated_at" BEFORE UPDATE ON "public"."products" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "rfid_keys_auto_revoke_on_status_change" AFTER UPDATE OF "status" ON "public"."rfid_keys" FOR EACH ROW EXECUTE FUNCTION "public"."rfid_keys_auto_revoke_on_status_change"();



CREATE OR REPLACE TRIGGER "rfid_keys_prevent_reassignment" BEFORE UPDATE ON "public"."rfid_keys" FOR EACH ROW EXECUTE FUNCTION "public"."rfid_keys_prevent_reassignment"();



CREATE OR REPLACE TRIGGER "rfid_keys_set_updated_at" BEFORE UPDATE ON "public"."rfid_keys" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "rfid_keys_sync_deactivated_at" BEFORE INSERT OR UPDATE ON "public"."rfid_keys" FOR EACH ROW EXECUTE FUNCTION "public"."rfid_keys_sync_deactivated_at"();



CREATE OR REPLACE TRIGGER "rfid_keys_trigger_request_recompute" AFTER INSERT OR UPDATE OF "picked_up_at" ON "public"."rfid_keys" FOR EACH ROW EXECUTE FUNCTION "public"."rfid_keys_trigger_request_recompute"();



CREATE OR REPLACE TRIGGER "rfid_keys_validate_pickup" BEFORE INSERT OR UPDATE OF "picked_up_at", "picked_up_by_dni", "picked_up_by_name", "picked_up_by_surname" ON "public"."rfid_keys" FOR EACH ROW EXECUTE FUNCTION "public"."rfid_keys_validate_pickup"();



CREATE OR REPLACE TRIGGER "rfid_keys_validate_request_link" BEFORE INSERT ON "public"."rfid_keys" FOR EACH ROW EXECUTE FUNCTION "public"."rfid_keys_validate_request_link"();



CREATE OR REPLACE TRIGGER "stock_movements_maintain_counters" AFTER INSERT ON "public"."stock_movements" FOR EACH ROW EXECUTE FUNCTION "public"."stock_movements_maintain_counters"();



CREATE OR REPLACE TRIGGER "stock_movements_no_delete" BEFORE DELETE ON "public"."stock_movements" FOR EACH ROW EXECUTE FUNCTION "public"."stock_movements_prevent_modification"();



CREATE OR REPLACE TRIGGER "stock_movements_no_update" BEFORE UPDATE ON "public"."stock_movements" FOR EACH ROW EXECUTE FUNCTION "public"."stock_movements_prevent_modification"();



CREATE OR REPLACE TRIGGER "technical_order_items_intent_immutable_trigger" BEFORE UPDATE ON "public"."technical_order_items" FOR EACH ROW EXECUTE FUNCTION "public"."technical_order_items_intent_immutable"();



CREATE OR REPLACE TRIGGER "technical_order_items_set_updated_at" BEFORE UPDATE ON "public"."technical_order_items" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "technical_orders_cancel_release_reservations_trigger" AFTER UPDATE ON "public"."technical_orders" FOR EACH ROW EXECUTE FUNCTION "public"."technical_orders_cancel_release_reservations"();



CREATE OR REPLACE TRIGGER "technical_orders_set_updated_at" BEFORE UPDATE ON "public"."technical_orders" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "units_set_updated_at" BEFORE UPDATE ON "public"."units" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "bill_items_check_parent_editable" BEFORE INSERT OR DELETE OR UPDATE ON "sales"."bill_items" FOR EACH ROW EXECUTE FUNCTION "sales"."bill_items_check_parent_editable"();



CREATE OR REPLACE TRIGGER "bill_items_check_product_active" BEFORE INSERT OR UPDATE ON "sales"."bill_items" FOR EACH ROW EXECUTE FUNCTION "sales"."validate_product_active_on_reference"();



CREATE OR REPLACE TRIGGER "bill_items_compute_subtotal" BEFORE INSERT OR UPDATE OF "quantity", "unit_price" ON "sales"."bill_items" FOR EACH ROW EXECUTE FUNCTION "sales"."compute_item_subtotal"();



CREATE OR REPLACE TRIGGER "bill_items_recompute_total" AFTER INSERT OR DELETE OR UPDATE ON "sales"."bill_items" FOR EACH ROW EXECUTE FUNCTION "sales"."recompute_bill_total"();



CREATE OR REPLACE TRIGGER "bill_items_set_updated_at" BEFORE UPDATE ON "sales"."bill_items" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "bills_prevent_cancel_with_payments" BEFORE UPDATE OF "status" ON "sales"."bills" FOR EACH ROW EXECUTE FUNCTION "sales"."bills_prevent_cancel_with_payments"();



CREATE OR REPLACE TRIGGER "bills_set_updated_at" BEFORE UPDATE ON "sales"."bills" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "bills_validate" BEFORE UPDATE ON "sales"."bills" FOR EACH ROW EXECUTE FUNCTION "sales"."bills_validate"();



CREATE OR REPLACE TRIGGER "key_request_items_set_updated_at" BEFORE UPDATE ON "sales"."key_request_items" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "key_request_items_validate" BEFORE INSERT OR UPDATE ON "sales"."key_request_items" FOR EACH ROW EXECUTE FUNCTION "sales"."key_request_items_validate"();



CREATE OR REPLACE TRIGGER "key_requests_set_updated_at" BEFORE UPDATE ON "sales"."key_requests" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "key_requests_validate" BEFORE INSERT OR UPDATE ON "sales"."key_requests" FOR EACH ROW EXECUTE FUNCTION "sales"."key_requests_validate"();



CREATE OR REPLACE TRIGGER "payments_set_updated_at" BEFORE UPDATE ON "sales"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "payments_validate" BEFORE INSERT OR UPDATE ON "sales"."payments" FOR EACH ROW EXECUTE FUNCTION "sales"."payments_validate"();



CREATE OR REPLACE TRIGGER "products_set_updated_at" BEFORE UPDATE ON "sales"."products" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "quote_items_check_parent_editable" BEFORE INSERT OR DELETE OR UPDATE ON "sales"."quote_items" FOR EACH ROW EXECUTE FUNCTION "sales"."quote_items_check_parent_editable"();



CREATE OR REPLACE TRIGGER "quote_items_check_product_active" BEFORE INSERT OR UPDATE ON "sales"."quote_items" FOR EACH ROW EXECUTE FUNCTION "sales"."validate_product_active_on_reference"();



CREATE OR REPLACE TRIGGER "quote_items_compute_subtotal" BEFORE INSERT OR UPDATE OF "quantity", "unit_price" ON "sales"."quote_items" FOR EACH ROW EXECUTE FUNCTION "sales"."compute_item_subtotal"();



CREATE OR REPLACE TRIGGER "quote_items_recompute_total" AFTER INSERT OR DELETE OR UPDATE ON "sales"."quote_items" FOR EACH ROW EXECUTE FUNCTION "sales"."recompute_quote_total"();



CREATE OR REPLACE TRIGGER "quote_items_set_updated_at" BEFORE UPDATE ON "sales"."quote_items" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "quotes_set_updated_at" BEFORE UPDATE ON "sales"."quotes" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "quotes_validate" BEFORE UPDATE ON "sales"."quotes" FOR EACH ROW EXECUTE FUNCTION "sales"."quotes_validate"();



CREATE OR REPLACE TRIGGER "recurring_charges_check_product_active" BEFORE INSERT OR UPDATE ON "sales"."recurring_charges" FOR EACH ROW EXECUTE FUNCTION "sales"."validate_product_active_on_reference"();



CREATE OR REPLACE TRIGGER "recurring_charges_set_updated_at" BEFORE UPDATE ON "sales"."recurring_charges" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "ticket_comments_no_delete" BEFORE DELETE ON "support"."ticket_comments" FOR EACH ROW EXECUTE FUNCTION "support"."ticket_comments_prevent_modification"();



CREATE OR REPLACE TRIGGER "ticket_comments_no_update" BEFORE UPDATE ON "support"."ticket_comments" FOR EACH ROW EXECUTE FUNCTION "support"."ticket_comments_prevent_modification"();



CREATE OR REPLACE TRIGGER "tickets_auto_transition_equipment" AFTER INSERT OR UPDATE OF "status" ON "support"."tickets" FOR EACH ROW EXECUTE FUNCTION "support"."auto_transition_equipment_on_maintenance"();



CREATE OR REPLACE TRIGGER "tickets_block_equipment_update_cancel_in_progress" BEFORE UPDATE OF "status" ON "support"."tickets" FOR EACH ROW EXECUTE FUNCTION "support"."tickets_block_equipment_update_cancel_in_progress"();



CREATE OR REPLACE TRIGGER "tickets_enforce_installer_columns" BEFORE UPDATE ON "support"."tickets" FOR EACH ROW EXECUTE FUNCTION "support"."enforce_installer_ticket_column_restrictions"();



CREATE OR REPLACE TRIGGER "tickets_reject_key_installation_inserts" BEFORE INSERT ON "support"."tickets" FOR EACH ROW EXECUTE FUNCTION "support"."tickets_reject_key_installation_inserts"();



CREATE OR REPLACE TRIGGER "tickets_require_equipment_on_resolve_trigger" BEFORE UPDATE OF "status" ON "support"."tickets" FOR EACH ROW EXECUTE FUNCTION "support"."tickets_require_equipment_on_resolve"();



CREATE OR REPLACE TRIGGER "tickets_resolution_chain_trigger" AFTER UPDATE OF "status" ON "support"."tickets" FOR EACH ROW EXECUTE FUNCTION "support"."tickets_resolution_chain"();



CREATE OR REPLACE TRIGGER "tickets_set_updated_at" BEFORE UPDATE ON "support"."tickets" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "tickets_sync_order_status_trigger" AFTER INSERT OR UPDATE OF "status" ON "support"."tickets" FOR EACH ROW EXECUTE FUNCTION "public"."tickets_sync_order_status"();



CREATE OR REPLACE TRIGGER "tickets_validate" BEFORE INSERT OR UPDATE ON "support"."tickets" FOR EACH ROW EXECUTE FUNCTION "support"."tickets_validate"();



ALTER TABLE ONLY "identity"."audit_log"
    ADD CONSTRAINT "audit_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "identity"."staff"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "identity"."audit_log"
    ADD CONSTRAINT "audit_log_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "identity"."staff"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "identity"."staff"
    ADD CONSTRAINT "staff_auth_user_id_fkey" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "operations"."equipment"
    ADD CONSTRAINT "equipment_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "operations"."equipment"
    ADD CONSTRAINT "equipment_replaces_equipment_id_fkey" FOREIGN KEY ("replaces_equipment_id") REFERENCES "operations"."equipment"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "operations"."key_authorizations"
    ADD CONSTRAINT "key_authorizations_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "operations"."equipment"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "operations"."key_authorizations"
    ADD CONSTRAINT "key_authorizations_installed_by_staff_id_fkey" FOREIGN KEY ("installed_by_staff_id") REFERENCES "identity"."staff"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "operations"."key_authorizations"
    ADD CONSTRAINT "key_authorizations_removed_by_staff_id_fkey" FOREIGN KEY ("removed_by_staff_id") REFERENCES "identity"."staff"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "operations"."key_authorizations"
    ADD CONSTRAINT "key_authorizations_rfid_key_id_fkey" FOREIGN KEY ("rfid_key_id") REFERENCES "public"."rfid_keys"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."buildings"
    ADD CONSTRAINT "buildings_administration_id_fkey" FOREIGN KEY ("administration_id") REFERENCES "public"."administrations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."key_events"
    ADD CONSTRAINT "key_events_actor_staff_id_fkey" FOREIGN KEY ("actor_staff_id") REFERENCES "identity"."staff"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."key_events"
    ADD CONSTRAINT "key_events_key_id_fkey" FOREIGN KEY ("key_id") REFERENCES "public"."rfid_keys"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."key_order_items"
    ADD CONSTRAINT "key_order_items_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."key_order_items"
    ADD CONSTRAINT "key_order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."key_orders"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."key_order_items"
    ADD CONSTRAINT "key_order_items_pickup_particular_id_fkey" FOREIGN KEY ("pickup_particular_id") REFERENCES "public"."particulares"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."key_order_items"
    ADD CONSTRAINT "key_order_items_produced_key_id_fkey" FOREIGN KEY ("produced_key_id") REFERENCES "public"."rfid_keys"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."key_order_items"
    ADD CONSTRAINT "key_order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."key_order_items"
    ADD CONSTRAINT "key_order_items_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."key_orders"
    ADD CONSTRAINT "key_orders_administration_id_fkey" FOREIGN KEY ("administration_id") REFERENCES "public"."administrations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."key_orders"
    ADD CONSTRAINT "key_orders_particular_id_fkey" FOREIGN KEY ("particular_id") REFERENCES "public"."particulares"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."key_orders"
    ADD CONSTRAINT "key_orders_pickup_particular_id_fkey" FOREIGN KEY ("pickup_particular_id") REFERENCES "public"."particulares"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."particulares"
    ADD CONSTRAINT "particulares_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."rfid_key_intended_equipment"
    ADD CONSTRAINT "rfid_key_intended_equipment_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "operations"."equipment"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."rfid_key_intended_equipment"
    ADD CONSTRAINT "rfid_key_intended_equipment_rfid_key_id_fkey" FOREIGN KEY ("rfid_key_id") REFERENCES "public"."rfid_keys"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rfid_keys"
    ADD CONSTRAINT "rfid_keys_delivered_by_staff_id_fkey" FOREIGN KEY ("delivered_by_staff_id") REFERENCES "identity"."staff"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rfid_keys"
    ADD CONSTRAINT "rfid_keys_key_request_item_id_fkey" FOREIGN KEY ("key_request_item_id") REFERENCES "sales"."key_request_items"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."rfid_keys"
    ADD CONSTRAINT "rfid_keys_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "stock_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."technical_order_items"
    ADD CONSTRAINT "technical_order_items_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."technical_order_items"
    ADD CONSTRAINT "technical_order_items_intended_assignee_staff_id_fkey" FOREIGN KEY ("intended_assignee_staff_id") REFERENCES "identity"."staff"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."technical_order_items"
    ADD CONSTRAINT "technical_order_items_intended_equipment_id_fkey" FOREIGN KEY ("intended_equipment_id") REFERENCES "operations"."equipment"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."technical_order_items"
    ADD CONSTRAINT "technical_order_items_intended_replacement_equipment_id_fkey" FOREIGN KEY ("intended_replacement_equipment_id") REFERENCES "operations"."equipment"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."technical_order_items"
    ADD CONSTRAINT "technical_order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."technical_orders"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."technical_order_items"
    ADD CONSTRAINT "technical_order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."technical_orders"
    ADD CONSTRAINT "technical_orders_administration_id_fkey" FOREIGN KEY ("administration_id") REFERENCES "public"."administrations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."technical_orders"
    ADD CONSTRAINT "technical_orders_particular_id_fkey" FOREIGN KEY ("particular_id") REFERENCES "public"."particulares"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."units"
    ADD CONSTRAINT "units_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "sales"."bill_items"
    ADD CONSTRAINT "bill_items_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "sales"."bills"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "sales"."bill_items"
    ADD CONSTRAINT "bill_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "sales"."products"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "sales"."bill_items"
    ADD CONSTRAINT "bill_items_related_equipment_id_fkey" FOREIGN KEY ("related_equipment_id") REFERENCES "operations"."equipment"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "sales"."bill_items"
    ADD CONSTRAINT "bill_items_related_key_request_item_id_fkey" FOREIGN KEY ("related_key_request_item_id") REFERENCES "sales"."key_request_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "sales"."bill_items"
    ADD CONSTRAINT "bill_items_related_recurring_charge_id_fkey" FOREIGN KEY ("related_recurring_charge_id") REFERENCES "sales"."recurring_charges"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "sales"."bills"
    ADD CONSTRAINT "bills_administration_id_fkey" FOREIGN KEY ("administration_id") REFERENCES "public"."administrations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "sales"."bills"
    ADD CONSTRAINT "bills_created_by_staff_id_fkey" FOREIGN KEY ("created_by_staff_id") REFERENCES "identity"."staff"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "sales"."bills"
    ADD CONSTRAINT "bills_from_quote_id_fkey" FOREIGN KEY ("from_quote_id") REFERENCES "sales"."quotes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "sales"."key_request_items"
    ADD CONSTRAINT "key_request_items_key_request_id_fkey" FOREIGN KEY ("key_request_id") REFERENCES "sales"."key_requests"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "sales"."key_request_items"
    ADD CONSTRAINT "key_request_items_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "sales"."key_requests"
    ADD CONSTRAINT "key_requests_administration_id_fkey" FOREIGN KEY ("administration_id") REFERENCES "public"."administrations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "sales"."key_requests"
    ADD CONSTRAINT "key_requests_pickup_particular_id_fkey" FOREIGN KEY ("pickup_particular_id") REFERENCES "public"."particulares"("id");



ALTER TABLE ONLY "sales"."key_requests"
    ADD CONSTRAINT "key_requests_received_by_staff_id_fkey" FOREIGN KEY ("received_by_staff_id") REFERENCES "identity"."staff"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "sales"."key_requests"
    ADD CONSTRAINT "key_requests_requester_particular_id_fkey" FOREIGN KEY ("requester_particular_id") REFERENCES "public"."particulares"("id");



ALTER TABLE ONLY "sales"."payments"
    ADD CONSTRAINT "payments_administration_id_fkey" FOREIGN KEY ("administration_id") REFERENCES "public"."administrations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "sales"."payments"
    ADD CONSTRAINT "payments_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "sales"."bills"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "sales"."quote_items"
    ADD CONSTRAINT "quote_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "sales"."products"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "sales"."quote_items"
    ADD CONSTRAINT "quote_items_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "sales"."quotes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "sales"."quotes"
    ADD CONSTRAINT "quotes_administration_id_fkey" FOREIGN KEY ("administration_id") REFERENCES "public"."administrations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "sales"."quotes"
    ADD CONSTRAINT "quotes_created_by_staff_id_fkey" FOREIGN KEY ("created_by_staff_id") REFERENCES "identity"."staff"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "sales"."recurring_charges"
    ADD CONSTRAINT "recurring_charges_administration_id_fkey" FOREIGN KEY ("administration_id") REFERENCES "public"."administrations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "sales"."recurring_charges"
    ADD CONSTRAINT "recurring_charges_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "sales"."products"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "support"."equipment_updates"
    ADD CONSTRAINT "equipment_updates_created_by_staff_id_fkey" FOREIGN KEY ("created_by_staff_id") REFERENCES "identity"."staff"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "support"."equipment_updates"
    ADD CONSTRAINT "equipment_updates_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "operations"."equipment"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "support"."equipment_updates"
    ADD CONSTRAINT "equipment_updates_resolved_by_staff_id_fkey" FOREIGN KEY ("resolved_by_staff_id") REFERENCES "identity"."staff"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "support"."equipment_updates"
    ADD CONSTRAINT "equipment_updates_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "support"."tickets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "support"."ticket_comments"
    ADD CONSTRAINT "ticket_comments_author_staff_id_fkey" FOREIGN KEY ("author_staff_id") REFERENCES "identity"."staff"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "support"."ticket_comments"
    ADD CONSTRAINT "ticket_comments_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "support"."tickets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "support"."tickets"
    ADD CONSTRAINT "tickets_administration_id_fkey" FOREIGN KEY ("administration_id") REFERENCES "public"."administrations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "support"."tickets"
    ADD CONSTRAINT "tickets_assigned_to_staff_id_fkey" FOREIGN KEY ("assigned_to_staff_id") REFERENCES "identity"."staff"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "support"."tickets"
    ADD CONSTRAINT "tickets_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "support"."tickets"
    ADD CONSTRAINT "tickets_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "operations"."equipment"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "support"."tickets"
    ADD CONSTRAINT "tickets_key_order_item_id_fkey" FOREIGN KEY ("key_order_item_id") REFERENCES "public"."key_order_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "support"."tickets"
    ADD CONSTRAINT "tickets_opened_by_staff_id_fkey" FOREIGN KEY ("opened_by_staff_id") REFERENCES "identity"."staff"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "support"."tickets"
    ADD CONSTRAINT "tickets_related_bill_id_fkey" FOREIGN KEY ("related_bill_id") REFERENCES "sales"."bills"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "support"."tickets"
    ADD CONSTRAINT "tickets_related_key_request_id_fkey" FOREIGN KEY ("related_key_request_id") REFERENCES "sales"."key_requests"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "support"."tickets"
    ADD CONSTRAINT "tickets_resolved_by_staff_id_fkey" FOREIGN KEY ("resolved_by_staff_id") REFERENCES "identity"."staff"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "support"."tickets"
    ADD CONSTRAINT "tickets_technical_order_item_id_fkey" FOREIGN KEY ("technical_order_item_id") REFERENCES "public"."technical_order_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "support"."tickets"
    ADD CONSTRAINT "tickets_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE RESTRICT;



CREATE POLICY "admin_all_staff" ON "identity"."staff" TO "authenticated" USING ("identity"."is_admin"()) WITH CHECK ("identity"."is_admin"());



CREATE POLICY "admin_read_audit_log" ON "identity"."audit_log" FOR SELECT TO "authenticated" USING ("identity"."is_admin"());



ALTER TABLE "identity"."audit_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "installer_read_staff" ON "identity"."staff" FOR SELECT TO "authenticated" USING ("identity"."is_installer"());



ALTER TABLE "identity"."staff" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admin_all_equipment" ON "operations"."equipment" TO "authenticated" USING ("identity"."is_admin"()) WITH CHECK ("identity"."is_admin"());



CREATE POLICY "admin_all_key_authorizations" ON "operations"."key_authorizations" TO "authenticated" USING ("identity"."is_admin"()) WITH CHECK ("identity"."is_admin"());



ALTER TABLE "operations"."equipment" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "installer_read_equipment" ON "operations"."equipment" FOR SELECT TO "authenticated" USING ("identity"."is_installer"());



CREATE POLICY "installer_read_key_authorizations" ON "operations"."key_authorizations" FOR SELECT TO "authenticated" USING ("identity"."is_installer"());



CREATE POLICY "installer_update_key_authorizations" ON "operations"."key_authorizations" FOR UPDATE TO "authenticated" USING ("identity"."is_installer"()) WITH CHECK ("identity"."is_installer"());



ALTER TABLE "operations"."key_authorizations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admin_all_administrations" ON "public"."administrations" TO "authenticated" USING ("identity"."is_admin"()) WITH CHECK ("identity"."is_admin"());



CREATE POLICY "admin_all_buildings" ON "public"."buildings" TO "authenticated" USING ("identity"."is_admin"()) WITH CHECK ("identity"."is_admin"());



CREATE POLICY "admin_all_key_events" ON "public"."key_events" TO "authenticated" USING ("identity"."is_admin"()) WITH CHECK ("identity"."is_admin"());



CREATE POLICY "admin_all_key_order_items" ON "public"."key_order_items" TO "authenticated" USING ("identity"."is_admin"()) WITH CHECK ("identity"."is_admin"());



CREATE POLICY "admin_all_key_orders" ON "public"."key_orders" TO "authenticated" USING ("identity"."is_admin"()) WITH CHECK ("identity"."is_admin"());



CREATE POLICY "admin_all_particulares" ON "public"."particulares" TO "authenticated" USING ("identity"."is_admin"()) WITH CHECK ("identity"."is_admin"());



CREATE POLICY "admin_all_products" ON "public"."products" TO "authenticated" USING ("identity"."is_admin"()) WITH CHECK ("identity"."is_admin"());



CREATE POLICY "admin_all_rfid_keys" ON "public"."rfid_keys" TO "authenticated" USING ("identity"."is_admin"()) WITH CHECK ("identity"."is_admin"());



CREATE POLICY "admin_all_stock_movements" ON "public"."stock_movements" TO "authenticated" USING ("identity"."is_admin"()) WITH CHECK ("identity"."is_admin"());



CREATE POLICY "admin_all_technical_order_items" ON "public"."technical_order_items" TO "authenticated" USING ("identity"."is_admin"()) WITH CHECK ("identity"."is_admin"());



CREATE POLICY "admin_all_technical_orders" ON "public"."technical_orders" TO "authenticated" USING ("identity"."is_admin"()) WITH CHECK ("identity"."is_admin"());



CREATE POLICY "admin_all_units" ON "public"."units" TO "authenticated" USING ("identity"."is_admin"()) WITH CHECK ("identity"."is_admin"());



ALTER TABLE "public"."administrations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."buildings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "installer_read_administrations" ON "public"."administrations" FOR SELECT TO "authenticated" USING ("identity"."is_installer"());



CREATE POLICY "installer_read_buildings" ON "public"."buildings" FOR SELECT TO "authenticated" USING ("identity"."is_installer"());



CREATE POLICY "installer_read_key_events" ON "public"."key_events" FOR SELECT TO "authenticated" USING ("identity"."is_installer"());



CREATE POLICY "installer_read_rfid_keys" ON "public"."rfid_keys" FOR SELECT TO "authenticated" USING ("identity"."is_installer"());



CREATE POLICY "installer_read_units" ON "public"."units" FOR SELECT TO "authenticated" USING ("identity"."is_installer"());



ALTER TABLE "public"."key_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."key_order_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."key_orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."particulares" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rfid_keys" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stock_movements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."technical_order_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."technical_orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."units" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admin_all_bill_items" ON "sales"."bill_items" TO "authenticated" USING ("identity"."is_admin"()) WITH CHECK ("identity"."is_admin"());



CREATE POLICY "admin_all_bills" ON "sales"."bills" TO "authenticated" USING ("identity"."is_admin"()) WITH CHECK ("identity"."is_admin"());



CREATE POLICY "admin_all_key_request_items" ON "sales"."key_request_items" TO "authenticated" USING ("identity"."is_admin"()) WITH CHECK ("identity"."is_admin"());



CREATE POLICY "admin_all_key_requests" ON "sales"."key_requests" TO "authenticated" USING ("identity"."is_admin"()) WITH CHECK ("identity"."is_admin"());



CREATE POLICY "admin_all_payments" ON "sales"."payments" TO "authenticated" USING ("identity"."is_admin"()) WITH CHECK ("identity"."is_admin"());



CREATE POLICY "admin_all_products" ON "sales"."products" TO "authenticated" USING ("identity"."is_admin"()) WITH CHECK ("identity"."is_admin"());



CREATE POLICY "admin_all_quote_items" ON "sales"."quote_items" TO "authenticated" USING ("identity"."is_admin"()) WITH CHECK ("identity"."is_admin"());



CREATE POLICY "admin_all_quotes" ON "sales"."quotes" TO "authenticated" USING ("identity"."is_admin"()) WITH CHECK ("identity"."is_admin"());



CREATE POLICY "admin_all_recurring_charges" ON "sales"."recurring_charges" TO "authenticated" USING ("identity"."is_admin"()) WITH CHECK ("identity"."is_admin"());



ALTER TABLE "sales"."bill_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "sales"."bills" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "sales"."key_request_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "sales"."key_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "sales"."payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "sales"."products" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "sales"."quote_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "sales"."quotes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "sales"."recurring_charges" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admin_all_equipment_updates" ON "support"."equipment_updates" TO "authenticated" USING ("identity"."is_admin"()) WITH CHECK ("identity"."is_admin"());



CREATE POLICY "admin_all_ticket_comments" ON "support"."ticket_comments" TO "authenticated" USING ("identity"."is_admin"()) WITH CHECK ("identity"."is_admin"());



CREATE POLICY "admin_all_tickets" ON "support"."tickets" TO "authenticated" USING ("identity"."is_admin"()) WITH CHECK ("identity"."is_admin"());



ALTER TABLE "support"."equipment_updates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "installer_insert_comments" ON "support"."ticket_comments" FOR INSERT TO "authenticated" WITH CHECK (("identity"."is_installer"() AND ("author_staff_id" = "identity"."current_staff_id"()) AND (EXISTS ( SELECT 1
   FROM "support"."tickets" "t"
  WHERE (("t"."id" = "ticket_comments"."ticket_id") AND ("t"."assigned_to_staff_id" = "identity"."current_staff_id"()))))));



CREATE POLICY "installer_read_assigned_equipment_updates" ON "support"."equipment_updates" FOR SELECT TO "authenticated" USING (("identity"."is_installer"() AND (EXISTS ( SELECT 1
   FROM "support"."tickets" "t"
  WHERE (("t"."id" = "equipment_updates"."ticket_id") AND ("t"."assigned_to_staff_id" = "identity"."current_staff_id"()))))));



CREATE POLICY "installer_read_comments" ON "support"."ticket_comments" FOR SELECT TO "authenticated" USING (("identity"."is_installer"() AND (EXISTS ( SELECT 1
   FROM "support"."tickets" "t"
  WHERE (("t"."id" = "ticket_comments"."ticket_id") AND ("t"."assigned_to_staff_id" = "identity"."current_staff_id"()))))));



CREATE POLICY "installer_read_own_tickets" ON "support"."tickets" FOR SELECT TO "authenticated" USING (("identity"."is_installer"() AND ("assigned_to_staff_id" = "identity"."current_staff_id"())));



CREATE POLICY "installer_update_own_tickets" ON "support"."tickets" FOR UPDATE TO "authenticated" USING (("identity"."is_installer"() AND ("assigned_to_staff_id" = "identity"."current_staff_id"()))) WITH CHECK (("identity"."is_installer"() AND ("assigned_to_staff_id" = "identity"."current_staff_id"())));



ALTER TABLE "support"."ticket_comments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "support"."tickets" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "identity" TO "authenticated";
GRANT USAGE ON SCHEMA "identity" TO "service_role";



GRANT USAGE ON SCHEMA "operations" TO "authenticated";
GRANT USAGE ON SCHEMA "operations" TO "service_role";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT USAGE ON SCHEMA "sales" TO "authenticated";
GRANT USAGE ON SCHEMA "sales" TO "service_role";



GRANT USAGE ON SCHEMA "support" TO "authenticated";
GRANT USAGE ON SCHEMA "support" TO "service_role";



GRANT ALL ON FUNCTION "identity"."current_staff_id"() TO "authenticated";
GRANT ALL ON FUNCTION "identity"."current_staff_id"() TO "service_role";



GRANT ALL ON FUNCTION "identity"."current_staff_role"() TO "authenticated";
GRANT ALL ON FUNCTION "identity"."current_staff_role"() TO "service_role";



GRANT ALL ON FUNCTION "identity"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "identity"."is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "identity"."is_installer"() TO "authenticated";
GRANT ALL ON FUNCTION "identity"."is_installer"() TO "service_role";



GRANT ALL ON FUNCTION "identity"."record_staff_audit_event"() TO "authenticated";
GRANT ALL ON FUNCTION "identity"."record_staff_audit_event"() TO "service_role";



GRANT ALL ON FUNCTION "operations"."enforce_installer_key_auth_column_restrictions"() TO "authenticated";
GRANT ALL ON FUNCTION "operations"."enforce_installer_key_auth_column_restrictions"() TO "service_role";



GRANT ALL ON FUNCTION "operations"."equipment_close_authorizations_on_dead"() TO "authenticated";
GRANT ALL ON FUNCTION "operations"."equipment_close_authorizations_on_dead"() TO "service_role";



GRANT ALL ON FUNCTION "operations"."equipment_prevent_reassignment"() TO "authenticated";
GRANT ALL ON FUNCTION "operations"."equipment_prevent_reassignment"() TO "service_role";



GRANT ALL ON FUNCTION "operations"."equipment_sync_decommissioned_at"() TO "authenticated";
GRANT ALL ON FUNCTION "operations"."equipment_sync_decommissioned_at"() TO "service_role";



GRANT ALL ON FUNCTION "operations"."equipment_validate_replacement"() TO "authenticated";
GRANT ALL ON FUNCTION "operations"."equipment_validate_replacement"() TO "service_role";



GRANT ALL ON FUNCTION "operations"."equipment_validate_status_transition"() TO "authenticated";
GRANT ALL ON FUNCTION "operations"."equipment_validate_status_transition"() TO "service_role";



GRANT ALL ON FUNCTION "operations"."key_authorizations_prevent_reassignment"() TO "authenticated";
GRANT ALL ON FUNCTION "operations"."key_authorizations_prevent_reassignment"() TO "service_role";



GRANT ALL ON FUNCTION "operations"."key_authorizations_sync_timestamps"() TO "authenticated";
GRANT ALL ON FUNCTION "operations"."key_authorizations_sync_timestamps"() TO "service_role";



GRANT ALL ON FUNCTION "operations"."key_authorizations_validate"() TO "authenticated";
GRANT ALL ON FUNCTION "operations"."key_authorizations_validate"() TO "service_role";



GRANT ALL ON FUNCTION "operations"."replace_equipment"("p_old_equipment_id" "uuid", "p_new_serial_number" "text", "p_new_model" "text", "p_new_description" "text", "p_new_access_type" "text", "p_decommission_reason" "text", "p_replacement_staff_id" "uuid", "p_activate_keys_directly" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "operations"."replace_equipment"("p_old_equipment_id" "uuid", "p_new_serial_number" "text", "p_new_model" "text", "p_new_description" "text", "p_new_access_type" "text", "p_decommission_reason" "text", "p_replacement_staff_id" "uuid", "p_activate_keys_directly" boolean) TO "service_role";



GRANT ALL ON FUNCTION "operations"."revoke_key_from_all_equipment"("p_rfid_key_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "operations"."revoke_key_from_all_equipment"("p_rfid_key_id" "uuid", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."cancel_key_disable"("p_key_id" "uuid", "p_actor_staff_id" "uuid", "p_note" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."cancel_key_disable"("p_key_id" "uuid", "p_actor_staff_id" "uuid", "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_key_disable"("p_key_id" "uuid", "p_actor_staff_id" "uuid", "p_note" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."cancel_key_order"("p_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."cancel_key_order"("p_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_key_order"("p_order_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."cancel_technical_order"("p_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."cancel_technical_order"("p_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_technical_order"("p_order_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."change_key_status"("p_key_id" "uuid", "p_status" "text", "p_note" "text", "p_actor_staff_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."change_key_status"("p_key_id" "uuid", "p_status" "text", "p_note" "text", "p_actor_staff_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."change_key_status"("p_key_id" "uuid", "p_status" "text", "p_note" "text", "p_actor_staff_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."complete_authorizations"("p_install_ids" "uuid"[], "p_remove_ids" "uuid"[], "p_staff_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."complete_authorizations"("p_install_ids" "uuid"[], "p_remove_ids" "uuid"[], "p_staff_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_authorizations"("p_install_ids" "uuid"[], "p_remove_ids" "uuid"[], "p_staff_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."configure_key_order_item"("p_order_item_id" "uuid", "p_rfid_code" "text", "p_unit_id" "uuid", "p_equipment_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."configure_key_order_item"("p_order_item_id" "uuid", "p_rfid_code" "text", "p_unit_id" "uuid", "p_equipment_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."configure_key_order_item"("p_order_item_id" "uuid", "p_rfid_code" "text", "p_unit_id" "uuid", "p_equipment_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."configure_technical_ticket_equipment"("p_ticket_id" "uuid", "p_new_serial" "text", "p_new_model" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."configure_technical_ticket_equipment"("p_ticket_id" "uuid", "p_new_serial" "text", "p_new_model" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."configure_technical_ticket_equipment"("p_ticket_id" "uuid", "p_new_serial" "text", "p_new_model" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."confirm_key_order"("p_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."confirm_key_order"("p_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."confirm_key_order"("p_order_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."confirm_technical_order"("p_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."confirm_technical_order"("p_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."confirm_technical_order"("p_order_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_and_assign_equipment"("p_ticket_id" "uuid", "p_building_id" "uuid", "p_serial" "text", "p_model" "text", "p_description" "text", "p_access_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_and_assign_equipment"("p_ticket_id" "uuid", "p_building_id" "uuid", "p_serial" "text", "p_model" "text", "p_description" "text", "p_access_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_and_assign_equipment"("p_ticket_id" "uuid", "p_building_id" "uuid", "p_serial" "text", "p_model" "text", "p_description" "text", "p_access_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_equipment_update"("p_equipment_id" "uuid", "p_administration_id" "uuid", "p_building_id" "uuid", "p_description" "text", "p_mdb_storage_path" "text", "p_keys_to_activate" "uuid"[], "p_keys_to_disable" "uuid"[], "p_actor_staff_id" "uuid", "p_assigned_to_staff_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_equipment_update"("p_equipment_id" "uuid", "p_administration_id" "uuid", "p_building_id" "uuid", "p_description" "text", "p_mdb_storage_path" "text", "p_keys_to_activate" "uuid"[], "p_keys_to_disable" "uuid"[], "p_actor_staff_id" "uuid", "p_assigned_to_staff_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_equipment_update"("p_equipment_id" "uuid", "p_administration_id" "uuid", "p_building_id" "uuid", "p_description" "text", "p_mdb_storage_path" "text", "p_keys_to_activate" "uuid"[], "p_keys_to_disable" "uuid"[], "p_actor_staff_id" "uuid", "p_assigned_to_staff_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_key_order_with_items"("p_order" "jsonb", "p_items" "jsonb"[], "p_confirm_immediately" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."create_key_order_with_items"("p_order" "jsonb", "p_items" "jsonb"[], "p_confirm_immediately" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_key_order_with_items"("p_order" "jsonb", "p_items" "jsonb"[], "p_confirm_immediately" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."create_product_with_initial_stock"("p_name" "text", "p_category" "text", "p_cost_price" numeric, "p_quantity" integer, "p_note" "text", "p_actor_staff_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_product_with_initial_stock"("p_name" "text", "p_category" "text", "p_cost_price" numeric, "p_quantity" integer, "p_note" "text", "p_actor_staff_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_product_with_initial_stock"("p_name" "text", "p_category" "text", "p_cost_price" numeric, "p_quantity" integer, "p_note" "text", "p_actor_staff_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_stock_movement"("p_product_id" "uuid", "p_type" "text", "p_quantity" integer, "p_unit_cost" numeric, "p_note" "text", "p_actor_staff_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_stock_movement"("p_product_id" "uuid", "p_type" "text", "p_quantity" integer, "p_unit_cost" numeric, "p_note" "text", "p_actor_staff_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_stock_movement"("p_product_id" "uuid", "p_type" "text", "p_quantity" integer, "p_unit_cost" numeric, "p_note" "text", "p_actor_staff_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_technical_order_with_items"("p_order" "jsonb", "p_items" "jsonb"[], "p_confirm_immediately" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."create_technical_order_with_items"("p_order" "jsonb", "p_items" "jsonb"[], "p_confirm_immediately" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_technical_order_with_items"("p_order" "jsonb", "p_items" "jsonb"[], "p_confirm_immediately" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."gen_key_order_number"() TO "anon";
GRANT ALL ON FUNCTION "public"."gen_key_order_number"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."gen_key_order_number"() TO "service_role";



GRANT ALL ON FUNCTION "public"."gen_technical_order_number"() TO "anon";
GRANT ALL ON FUNCTION "public"."gen_technical_order_number"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."gen_technical_order_number"() TO "service_role";



GRANT ALL ON FUNCTION "public"."key_order_items_recompute_order_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."key_order_items_recompute_order_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."key_order_items_recompute_order_status"() TO "service_role";



GRANT ALL ON FUNCTION "public"."key_orders_cancel_release_reservations"() TO "anon";
GRANT ALL ON FUNCTION "public"."key_orders_cancel_release_reservations"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."key_orders_cancel_release_reservations"() TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_key_order_invoiced"("p_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mark_key_order_invoiced"("p_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_key_order_invoiced"("p_order_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_key_order_item_installed"("p_order_item_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mark_key_order_item_installed"("p_order_item_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_key_order_item_installed"("p_order_item_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_technical_order_invoiced"("p_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mark_technical_order_invoiced"("p_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_technical_order_invoiced"("p_order_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."recompute_key_order_status"("p_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."recompute_key_order_status"("p_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."recompute_key_order_status"("p_order_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."recompute_technical_order_status"("p_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."recompute_technical_order_status"("p_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."recompute_technical_order_status"("p_order_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."record_order_key_pickup"("p_key_id" "uuid", "p_picked_up_by_name" "text", "p_picked_up_by_surname" "text", "p_picked_up_by_dni" "text", "p_actor_staff_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."record_order_key_pickup"("p_key_id" "uuid", "p_picked_up_by_name" "text", "p_picked_up_by_surname" "text", "p_picked_up_by_dni" "text", "p_actor_staff_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_order_key_pickup"("p_key_id" "uuid", "p_picked_up_by_name" "text", "p_picked_up_by_surname" "text", "p_picked_up_by_dni" "text", "p_actor_staff_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."request_key_disable"("p_key_id" "uuid", "p_actor_staff_id" "uuid", "p_note" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."request_key_disable"("p_key_id" "uuid", "p_actor_staff_id" "uuid", "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_key_disable"("p_key_id" "uuid", "p_actor_staff_id" "uuid", "p_note" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."resolve_equipment_installation"("p_ticket_id" "uuid", "p_serial" "text", "p_unit_id" "uuid", "p_note" "text", "p_actor_staff_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_equipment_installation"("p_ticket_id" "uuid", "p_serial" "text", "p_unit_id" "uuid", "p_note" "text", "p_actor_staff_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_equipment_installation"("p_ticket_id" "uuid", "p_serial" "text", "p_unit_id" "uuid", "p_note" "text", "p_actor_staff_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."resolve_equipment_replacement"("p_ticket_id" "uuid", "p_old_equipment_id" "uuid", "p_new_serial" "text", "p_new_model" "text", "p_new_description" "text", "p_note" "text", "p_actor_staff_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_equipment_replacement"("p_ticket_id" "uuid", "p_old_equipment_id" "uuid", "p_new_serial" "text", "p_new_model" "text", "p_new_description" "text", "p_note" "text", "p_actor_staff_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_equipment_replacement"("p_ticket_id" "uuid", "p_old_equipment_id" "uuid", "p_new_serial" "text", "p_new_model" "text", "p_new_description" "text", "p_note" "text", "p_actor_staff_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."resolve_equipment_update"("p_task_id" "uuid", "p_actor_staff_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_equipment_update"("p_task_id" "uuid", "p_actor_staff_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_equipment_update"("p_task_id" "uuid", "p_actor_staff_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."resolve_ticket"("p_ticket_id" "uuid", "p_note" "text", "p_actor_staff_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_ticket"("p_ticket_id" "uuid", "p_note" "text", "p_actor_staff_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_ticket"("p_ticket_id" "uuid", "p_note" "text", "p_actor_staff_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rfid_keys_auto_revoke_on_status_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."rfid_keys_auto_revoke_on_status_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rfid_keys_auto_revoke_on_status_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rfid_keys_prevent_reassignment"() TO "anon";
GRANT ALL ON FUNCTION "public"."rfid_keys_prevent_reassignment"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rfid_keys_prevent_reassignment"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rfid_keys_sync_deactivated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."rfid_keys_sync_deactivated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rfid_keys_sync_deactivated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rfid_keys_trigger_request_recompute"() TO "anon";
GRANT ALL ON FUNCTION "public"."rfid_keys_trigger_request_recompute"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rfid_keys_trigger_request_recompute"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rfid_keys_validate_pickup"() TO "anon";
GRANT ALL ON FUNCTION "public"."rfid_keys_validate_pickup"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rfid_keys_validate_pickup"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rfid_keys_validate_request_link"() TO "anon";
GRANT ALL ON FUNCTION "public"."rfid_keys_validate_request_link"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rfid_keys_validate_request_link"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."stock_movements_maintain_counters"() TO "anon";
GRANT ALL ON FUNCTION "public"."stock_movements_maintain_counters"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."stock_movements_maintain_counters"() TO "service_role";



GRANT ALL ON FUNCTION "public"."stock_movements_prevent_modification"() TO "anon";
GRANT ALL ON FUNCTION "public"."stock_movements_prevent_modification"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."stock_movements_prevent_modification"() TO "service_role";



GRANT ALL ON FUNCTION "public"."technical_order_items_intent_immutable"() TO "anon";
GRANT ALL ON FUNCTION "public"."technical_order_items_intent_immutable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."technical_order_items_intent_immutable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."technical_orders_cancel_release_reservations"() TO "anon";
GRANT ALL ON FUNCTION "public"."technical_orders_cancel_release_reservations"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."technical_orders_cancel_release_reservations"() TO "service_role";



GRANT ALL ON FUNCTION "public"."tickets_sync_order_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."tickets_sync_order_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tickets_sync_order_status"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_draft_key_order_with_items"("p_order_id" "uuid", "p_patch" "jsonb", "p_items" "jsonb"[], "p_expected_updated_at" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."update_draft_key_order_with_items"("p_order_id" "uuid", "p_patch" "jsonb", "p_items" "jsonb"[], "p_expected_updated_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_draft_key_order_with_items"("p_order_id" "uuid", "p_patch" "jsonb", "p_items" "jsonb"[], "p_expected_updated_at" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_draft_technical_order_with_items"("p_order_id" "uuid", "p_patch" "jsonb", "p_items" "jsonb"[], "p_expected_updated_at" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."update_draft_technical_order_with_items"("p_order_id" "uuid", "p_patch" "jsonb", "p_items" "jsonb"[], "p_expected_updated_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_draft_technical_order_with_items"("p_order_id" "uuid", "p_patch" "jsonb", "p_items" "jsonb"[], "p_expected_updated_at" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "sales"."bill_items_check_parent_editable"() TO "authenticated";
GRANT ALL ON FUNCTION "sales"."bill_items_check_parent_editable"() TO "service_role";



GRANT ALL ON FUNCTION "sales"."bills_prevent_cancel_with_payments"() TO "authenticated";
GRANT ALL ON FUNCTION "sales"."bills_prevent_cancel_with_payments"() TO "service_role";



GRANT ALL ON FUNCTION "sales"."bills_validate"() TO "authenticated";
GRANT ALL ON FUNCTION "sales"."bills_validate"() TO "service_role";



GRANT ALL ON FUNCTION "sales"."compute_item_subtotal"() TO "authenticated";
GRANT ALL ON FUNCTION "sales"."compute_item_subtotal"() TO "service_role";



GRANT ALL ON FUNCTION "sales"."gen_bill_number"() TO "authenticated";
GRANT ALL ON FUNCTION "sales"."gen_bill_number"() TO "service_role";



GRANT ALL ON FUNCTION "sales"."gen_key_request_number"() TO "authenticated";
GRANT ALL ON FUNCTION "sales"."gen_key_request_number"() TO "service_role";



GRANT ALL ON FUNCTION "sales"."gen_quote_number"() TO "authenticated";
GRANT ALL ON FUNCTION "sales"."gen_quote_number"() TO "service_role";



GRANT ALL ON FUNCTION "sales"."generate_recurring_charges"("p_year" integer, "p_month" integer) TO "authenticated";
GRANT ALL ON FUNCTION "sales"."generate_recurring_charges"("p_year" integer, "p_month" integer) TO "service_role";



GRANT ALL ON FUNCTION "sales"."key_request_items_validate"() TO "authenticated";
GRANT ALL ON FUNCTION "sales"."key_request_items_validate"() TO "service_role";



GRANT ALL ON FUNCTION "sales"."key_requests_validate"() TO "authenticated";
GRANT ALL ON FUNCTION "sales"."key_requests_validate"() TO "service_role";



GRANT ALL ON FUNCTION "sales"."payments_validate"() TO "authenticated";
GRANT ALL ON FUNCTION "sales"."payments_validate"() TO "service_role";



GRANT ALL ON FUNCTION "sales"."quote_items_check_parent_editable"() TO "authenticated";
GRANT ALL ON FUNCTION "sales"."quote_items_check_parent_editable"() TO "service_role";



GRANT ALL ON FUNCTION "sales"."quotes_validate"() TO "authenticated";
GRANT ALL ON FUNCTION "sales"."quotes_validate"() TO "service_role";



GRANT ALL ON FUNCTION "sales"."recompute_bill_total"() TO "authenticated";
GRANT ALL ON FUNCTION "sales"."recompute_bill_total"() TO "service_role";



GRANT ALL ON FUNCTION "sales"."recompute_quote_total"() TO "authenticated";
GRANT ALL ON FUNCTION "sales"."recompute_quote_total"() TO "service_role";



GRANT ALL ON FUNCTION "sales"."recompute_request_status"("p_request_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "sales"."recompute_request_status"("p_request_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "sales"."validate_product_active_on_reference"() TO "authenticated";
GRANT ALL ON FUNCTION "sales"."validate_product_active_on_reference"() TO "service_role";



GRANT ALL ON FUNCTION "support"."auto_transition_equipment_on_maintenance"() TO "authenticated";
GRANT ALL ON FUNCTION "support"."auto_transition_equipment_on_maintenance"() TO "service_role";



GRANT ALL ON FUNCTION "support"."enforce_installer_ticket_column_restrictions"() TO "authenticated";
GRANT ALL ON FUNCTION "support"."enforce_installer_ticket_column_restrictions"() TO "service_role";



GRANT ALL ON FUNCTION "support"."gen_ticket_number"() TO "authenticated";
GRANT ALL ON FUNCTION "support"."gen_ticket_number"() TO "service_role";



GRANT ALL ON FUNCTION "support"."ticket_comments_prevent_modification"() TO "authenticated";
GRANT ALL ON FUNCTION "support"."ticket_comments_prevent_modification"() TO "service_role";



GRANT ALL ON FUNCTION "support"."tickets_block_equipment_update_cancel_in_progress"() TO "authenticated";
GRANT ALL ON FUNCTION "support"."tickets_block_equipment_update_cancel_in_progress"() TO "service_role";



GRANT ALL ON FUNCTION "support"."tickets_reject_key_installation_inserts"() TO "authenticated";
GRANT ALL ON FUNCTION "support"."tickets_reject_key_installation_inserts"() TO "service_role";



GRANT ALL ON FUNCTION "support"."tickets_require_equipment_on_resolve"() TO "authenticated";
GRANT ALL ON FUNCTION "support"."tickets_require_equipment_on_resolve"() TO "service_role";



GRANT ALL ON FUNCTION "support"."tickets_resolution_chain"() TO "authenticated";
GRANT ALL ON FUNCTION "support"."tickets_resolution_chain"() TO "service_role";



GRANT ALL ON FUNCTION "support"."tickets_validate"() TO "authenticated";
GRANT ALL ON FUNCTION "support"."tickets_validate"() TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "identity"."audit_log" TO "authenticated";
GRANT ALL ON TABLE "identity"."audit_log" TO "service_role";



GRANT ALL ON TABLE "identity"."staff" TO "authenticated";
GRANT ALL ON TABLE "identity"."staff" TO "service_role";



GRANT ALL ON TABLE "operations"."equipment" TO "authenticated";
GRANT ALL ON TABLE "operations"."equipment" TO "service_role";



GRANT ALL ON TABLE "operations"."key_authorizations" TO "authenticated";
GRANT ALL ON TABLE "operations"."key_authorizations" TO "service_role";



GRANT ALL ON TABLE "public"."administrations" TO "anon";
GRANT ALL ON TABLE "public"."administrations" TO "authenticated";
GRANT ALL ON TABLE "public"."administrations" TO "service_role";



GRANT ALL ON TABLE "public"."key_orders" TO "anon";
GRANT ALL ON TABLE "public"."key_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."key_orders" TO "service_role";



GRANT ALL ON TABLE "public"."technical_orders" TO "anon";
GRANT ALL ON TABLE "public"."technical_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."technical_orders" TO "service_role";



GRANT ALL ON TABLE "public"."all_orders" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."all_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."all_orders" TO "service_role";



GRANT ALL ON TABLE "public"."buildings" TO "anon";
GRANT ALL ON TABLE "public"."buildings" TO "authenticated";
GRANT ALL ON TABLE "public"."buildings" TO "service_role";



GRANT ALL ON TABLE "public"."rfid_keys" TO "anon";
GRANT ALL ON TABLE "public"."rfid_keys" TO "authenticated";
GRANT ALL ON TABLE "public"."rfid_keys" TO "service_role";



GRANT ALL ON TABLE "public"."equipment_inventory" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."equipment_inventory" TO "authenticated";
GRANT ALL ON TABLE "public"."equipment_inventory" TO "service_role";



GRANT ALL ON TABLE "public"."key_events" TO "anon";
GRANT ALL ON TABLE "public"."key_events" TO "authenticated";
GRANT ALL ON TABLE "public"."key_events" TO "service_role";



GRANT ALL ON TABLE "public"."key_order_items" TO "anon";
GRANT ALL ON TABLE "public"."key_order_items" TO "authenticated";
GRANT ALL ON TABLE "public"."key_order_items" TO "service_role";



GRANT ALL ON SEQUENCE "public"."key_order_number_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."key_order_number_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."key_order_number_seq" TO "service_role";



GRANT ALL ON TABLE "public"."key_orders_summary" TO "anon";
GRANT ALL ON TABLE "public"."key_orders_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."key_orders_summary" TO "service_role";



GRANT ALL ON TABLE "public"."units" TO "anon";
GRANT ALL ON TABLE "public"."units" TO "authenticated";
GRANT ALL ON TABLE "public"."units" TO "service_role";



GRANT ALL ON TABLE "public"."keys_inventory" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."keys_inventory" TO "authenticated";
GRANT ALL ON TABLE "public"."keys_inventory" TO "service_role";



GRANT ALL ON TABLE "public"."particulares" TO "anon";
GRANT ALL ON TABLE "public"."particulares" TO "authenticated";
GRANT ALL ON TABLE "public"."particulares" TO "service_role";



GRANT ALL ON TABLE "public"."products" TO "anon";
GRANT ALL ON TABLE "public"."products" TO "authenticated";
GRANT ALL ON TABLE "public"."products" TO "service_role";



GRANT ALL ON TABLE "public"."rfid_key_intended_equipment" TO "anon";
GRANT ALL ON TABLE "public"."rfid_key_intended_equipment" TO "authenticated";
GRANT ALL ON TABLE "public"."rfid_key_intended_equipment" TO "service_role";



GRANT ALL ON TABLE "public"."stock_movements" TO "anon";
GRANT ALL ON TABLE "public"."stock_movements" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_movements" TO "service_role";



GRANT ALL ON TABLE "public"."technical_order_items" TO "anon";
GRANT ALL ON TABLE "public"."technical_order_items" TO "authenticated";
GRANT ALL ON TABLE "public"."technical_order_items" TO "service_role";



GRANT ALL ON SEQUENCE "public"."technical_order_number_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."technical_order_number_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."technical_order_number_seq" TO "service_role";



GRANT ALL ON TABLE "public"."technical_orders_summary" TO "anon";
GRANT ALL ON TABLE "public"."technical_orders_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."technical_orders_summary" TO "service_role";



GRANT ALL ON TABLE "sales"."bills" TO "authenticated";
GRANT ALL ON TABLE "sales"."bills" TO "service_role";



GRANT ALL ON TABLE "sales"."payments" TO "authenticated";
GRANT ALL ON TABLE "sales"."payments" TO "service_role";



GRANT ALL ON TABLE "sales"."administration_balance" TO "authenticated";
GRANT ALL ON TABLE "sales"."administration_balance" TO "service_role";



GRANT ALL ON TABLE "sales"."bill_items" TO "authenticated";
GRANT ALL ON TABLE "sales"."bill_items" TO "service_role";



GRANT ALL ON SEQUENCE "sales"."bill_number_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "sales"."bill_number_seq" TO "service_role";



GRANT ALL ON TABLE "sales"."key_request_items" TO "authenticated";
GRANT ALL ON TABLE "sales"."key_request_items" TO "service_role";



GRANT ALL ON SEQUENCE "sales"."key_request_number_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "sales"."key_request_number_seq" TO "service_role";



GRANT ALL ON TABLE "sales"."key_requests" TO "authenticated";
GRANT ALL ON TABLE "sales"."key_requests" TO "service_role";



GRANT ALL ON TABLE "sales"."pending_to_invoice" TO "authenticated";
GRANT ALL ON TABLE "sales"."pending_to_invoice" TO "service_role";



GRANT ALL ON TABLE "sales"."products" TO "authenticated";
GRANT ALL ON TABLE "sales"."products" TO "service_role";



GRANT ALL ON TABLE "sales"."quote_items" TO "authenticated";
GRANT ALL ON TABLE "sales"."quote_items" TO "service_role";



GRANT ALL ON SEQUENCE "sales"."quote_number_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "sales"."quote_number_seq" TO "service_role";



GRANT ALL ON TABLE "sales"."quotes" TO "authenticated";
GRANT ALL ON TABLE "sales"."quotes" TO "service_role";



GRANT ALL ON TABLE "sales"."recurring_charges" TO "authenticated";
GRANT ALL ON TABLE "sales"."recurring_charges" TO "service_role";



GRANT ALL ON TABLE "support"."equipment_updates" TO "authenticated";
GRANT ALL ON TABLE "support"."equipment_updates" TO "service_role";



GRANT ALL ON TABLE "support"."tickets" TO "authenticated";
GRANT ALL ON TABLE "support"."tickets" TO "service_role";



GRANT ALL ON TABLE "support"."installer_tickets_with_context" TO "authenticated";
GRANT ALL ON TABLE "support"."installer_tickets_with_context" TO "service_role";



GRANT ALL ON TABLE "support"."technical_order_tickets" TO "authenticated";
GRANT ALL ON TABLE "support"."technical_order_tickets" TO "service_role";



GRANT ALL ON TABLE "support"."ticket_comments" TO "authenticated";
GRANT ALL ON TABLE "support"."ticket_comments" TO "service_role";



GRANT ALL ON SEQUENCE "support"."ticket_number_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "support"."ticket_number_seq" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "identity" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "identity" GRANT ALL ON SEQUENCES TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "identity" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "identity" GRANT ALL ON FUNCTIONS TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "identity" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "identity" GRANT ALL ON TABLES TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "operations" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "operations" GRANT ALL ON SEQUENCES TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "operations" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "operations" GRANT ALL ON FUNCTIONS TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "operations" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "operations" GRANT ALL ON TABLES TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "sales" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "sales" GRANT ALL ON SEQUENCES TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "sales" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "sales" GRANT ALL ON FUNCTIONS TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "sales" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "sales" GRANT ALL ON TABLES TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "support" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "support" GRANT ALL ON SEQUENCES TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "support" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "support" GRANT ALL ON FUNCTIONS TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "support" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "support" GRANT ALL ON TABLES TO "service_role";





-- ------------------------------------------------------------
-- 3. Read-only guarantees on inventory/reporting views
-- ------------------------------------------------------------
-- ALTER DEFAULT PRIVILEGES on public grants ALL to authenticated when
-- postgres creates a view; the following REVOKEs restore the read-only
-- intent that the original migrations enforced.
revoke insert, update, delete on public.keys_inventory       from public, authenticated;
revoke insert, update, delete on public.equipment_inventory  from public, authenticated;
revoke insert, update, delete on public.all_orders           from public, authenticated;

-- ------------------------------------------------------------
-- 4. Storage bucket: equipment-updates-mdb + policies
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'equipment-updates-mdb',
    'equipment-updates-mdb',
    false,
    52428800,
    array['application/x-msaccess', 'application/msaccess', 'application/octet-stream']
  )
  on conflict (id) do update
    set public          = false,
        file_size_limit = 52428800;

create policy "admin_all_equipment_updates_mdb" on storage.objects
  for all to authenticated
  using  (bucket_id = 'equipment-updates-mdb' and identity.is_admin())
  with check (bucket_id = 'equipment-updates-mdb' and identity.is_admin());

create policy "installer_read_assigned_equipment_updates_mdb"
  on storage.objects
  for select to authenticated
  using (
    bucket_id = 'equipment-updates-mdb'
    and identity.is_installer()
    and exists (
      select 1
        from support.tickets t
       where t.id::text = split_part(name, '/', 1)
         and t.assigned_to_staff_id = identity.current_staff_id()
    )
  );

-- ------------------------------------------------------------
-- 5. pg_cron — job mensual para generar recurring_charges (defensivo)
-- ------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_available_extensions
    where name = 'pg_cron'
  ) then
    create extension if not exists pg_cron;
    perform cron.schedule(
      'sales-generate-monthly-charges',
      '0 8 1 * *',
      $job$
        select sales.generate_recurring_charges(
          extract(year from now())::int,
          extract(month from now())::int
        );
      $job$
    );
    raise notice 'pg_cron scheduled: sales-generate-monthly-charges (0 8 1 * *)';
  else
    raise notice 'pg_cron not available in this environment. Recurring charges '
      'must be generated manually via sales.generate_recurring_charges(year, month).';
  end if;
exception
  when others then
    raise notice 'pg_cron setup failed (%). Run sales.generate_recurring_charges manually.', sqlerrm;
end $$;
