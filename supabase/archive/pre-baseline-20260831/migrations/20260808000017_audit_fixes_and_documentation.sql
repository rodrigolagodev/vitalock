-- ============================================================
-- Audit fixes + full documentation
-- ============================================================
-- Consolida las correcciones surgidas de la auditoría completa (2026-08-08)
-- y agrega documentación inline (COMMENT ON) a todas las tablas y funciones.
--
-- Layout:
--   Sección 1 (CRÍTICO)  — Views con security_invoker
--   Sección 2 (CRÍTICO)  — Proteger cancelación de bills con payments
--   Sección 3 (HIGH)     — 16 índices sobre FKs sin cobertura
--   Sección 4 (MEDIUM)   — Volatilidad correcta en compute_item_subtotal
--   Sección 5 (MEDIUM)   — Statement timeout por rol
--   Sección 6 (MEDIUM)   — Bloqueo de referencias a products inactivos
--   Sección 7 (LOW)      — COMMENT ON TABLE (18 tablas)
--   Sección 8 (LOW)      — COMMENT ON FUNCTION (todas las que faltan)


-- ============================================================
-- SECCIÓN 1 — CRÍTICO: views con security_invoker=true
-- ============================================================
-- Por default, las views corren con los privilegios del owner (postgres, que
-- tiene BYPASSRLS). Sin esto, cualquier authenticated ve TODO lo que las views
-- exponen, aunque las tablas subyacentes tengan RLS estricta. Confirmado en
-- audit: Bruno (installer) veía bills via sales.pending_to_invoice.

alter view sales.pending_to_invoice     set (security_invoker = true);
alter view sales.administration_balance set (security_invoker = true);


-- ============================================================
-- SECCIÓN 2 — CRÍTICO: no cancelar bills con payments
-- ============================================================
-- Antes: se podía cancelar una bill con un payment activo, dejando el balance
-- inconsistente y sin forma de rollback (cancelled es terminal).
-- Ahora: se rechaza la transición confirmed → cancelled si existe algún pago.

create or replace function sales.bills_prevent_cancel_with_payments()
returns trigger language plpgsql as $$
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

create trigger bills_prevent_cancel_with_payments
before update of status on sales.bills
for each row execute function sales.bills_prevent_cancel_with_payments();


-- ============================================================
-- SECCIÓN 3 — HIGH: índices sobre FKs sin cobertura
-- ============================================================
-- Postgres no auto-indexea columnas FK. Sin índice, cada DELETE del parent
-- fuerza un seq scan sobre el child (O(n) por delete) y los joins que filtran
-- por esas FKs también se degradan.
--
-- Todos los índices son PARCIALES (WHERE col IS NOT NULL) porque las FKs son
-- nullables: no gastamos espacio en NULLs, y las queries típicas filtran por
-- "asignado a alguien" o "vinculado a algo".

create index if not exists key_authorizations_installed_by_staff_id_idx
  on operations.key_authorizations (installed_by_staff_id)
  where installed_by_staff_id is not null;

create index if not exists key_authorizations_removed_by_staff_id_idx
  on operations.key_authorizations (removed_by_staff_id)
  where removed_by_staff_id is not null;

create index if not exists rfid_keys_delivered_by_staff_id_idx
  on public.rfid_keys (delivered_by_staff_id)
  where delivered_by_staff_id is not null;

create index if not exists bills_created_by_staff_id_idx
  on sales.bills (created_by_staff_id)
  where created_by_staff_id is not null;

create index if not exists bills_from_quote_id_idx
  on sales.bills (from_quote_id)
  where from_quote_id is not null;

create index if not exists bill_items_product_id_idx
  on sales.bill_items (product_id)
  where product_id is not null;

create index if not exists key_requests_received_by_staff_id_idx
  on sales.key_requests (received_by_staff_id)
  where received_by_staff_id is not null;

create index if not exists quote_items_product_id_idx
  on sales.quote_items (product_id)
  where product_id is not null;

create index if not exists quotes_created_by_staff_id_idx
  on sales.quotes (created_by_staff_id)
  where created_by_staff_id is not null;

create index if not exists recurring_charges_product_id_idx
  on sales.recurring_charges (product_id)
  where product_id is not null;

create index if not exists ticket_comments_author_staff_id_idx
  on support.ticket_comments (author_staff_id)
  where author_staff_id is not null;

create index if not exists tickets_opened_by_staff_id_idx
  on support.tickets (opened_by_staff_id)
  where opened_by_staff_id is not null;

create index if not exists tickets_resolved_by_staff_id_idx
  on support.tickets (resolved_by_staff_id)
  where resolved_by_staff_id is not null;

create index if not exists tickets_related_bill_id_idx
  on support.tickets (related_bill_id)
  where related_bill_id is not null;

create index if not exists tickets_related_key_request_id_idx
  on support.tickets (related_key_request_id)
  where related_key_request_id is not null;

create index if not exists tickets_unit_id_idx
  on support.tickets (unit_id)
  where unit_id is not null;


-- ============================================================
-- SECCIÓN 4 — MEDIUM: compute_item_subtotal IMMUTABLE
-- ============================================================
-- La función es puramente determinística sobre sus inputs (NEW.quantity y
-- NEW.unit_price). Marcarla IMMUTABLE es best practice y no altera el
-- comportamiento en el contexto de trigger.

create or replace function sales.compute_item_subtotal()
returns trigger
language plpgsql
immutable
as $$
begin
  new.subtotal := round(new.quantity * new.unit_price, 2);
  return new;
end;
$$;


-- ============================================================
-- SECCIÓN 5 — MEDIUM: statement_timeout por rol
-- ============================================================
-- Defensa contra queries mal escritas o runaway. Los valores replican los
-- defaults típicos de Supabase cloud, pero al ponerlos explícitos garantizan
-- consistencia entre local y cloud.

alter role authenticated set statement_timeout = '10s';
alter role anon           set statement_timeout = '3s';
-- service_role y postgres sin timeout (para migraciones, jobs, etc.)


-- ============================================================
-- SECCIÓN 6 — MEDIUM: bloqueo de referencias a products inactivos
-- ============================================================
-- Antes: se podía crear un bill_item / quote_item / recurring_charge apuntando
-- a un product con is_active=false. Los cargos históricos siguen válidos (sus
-- FKs se mantienen) pero se rechazan altas nuevas contra productos discontinuados.

create or replace function sales.validate_product_active_on_reference()
returns trigger language plpgsql as $$
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

create trigger bill_items_check_product_active
before insert or update on sales.bill_items
for each row execute function sales.validate_product_active_on_reference();

create trigger quote_items_check_product_active
before insert or update on sales.quote_items
for each row execute function sales.validate_product_active_on_reference();

create trigger recurring_charges_check_product_active
before insert or update on sales.recurring_charges
for each row execute function sales.validate_product_active_on_reference();


-- ============================================================
-- SECCIÓN 7 — LOW: COMMENT ON TABLE (documentación de todas las tablas)
-- ============================================================

comment on table public.administrations is
  'Ente comercial que factura. Es el único tipo de "cliente" que el sistema '
  'reconoce — propietarios e inquilinos NO son entidades, sus datos van como '
  'texto libre en rfid_keys.notes o key_requests.requester_*. Baja lógica '
  'via status="inactive" (nunca borrado físico por trazabilidad legal).';

comment on table public.buildings is
  'Edificio perteneciente a una administración. Cada edificio hospeda 0+N '
  'equipment y contiene 1+N units. administration_id es FK RESTRICT — no se '
  'puede borrar una admin con edificios activos.';

comment on table public.units is
  'Unidad dentro de un edificio: departamento, local, cochera, o el slot '
  'administrativo (is_administrative=true, único por edificio via unique '
  'index parcial). El "number" es único dentro de su edificio (dos edificios '
  'pueden tener ambos "101"). Toda rfid_key vive en una unit.';

comment on table public.rfid_keys is
  'Tarjeta RFID física emitida por Vitalock. rfid_code único global. unit_id '
  'inmutable (regla de trazabilidad legal). Las llaves administrativas viven '
  'en la unit con is_administrative=true; el rol específico (portero, '
  'mantenimiento) va en notes. Puede opcionalmente estar vinculada a un '
  'key_request_item que la generó, y a los datos del retiro (picked_up_*).';

comment on table identity.staff is
  'Empleado interno de Vitalock. Vinculable a auth.users via auth_user_id '
  '(opcional para pre-provisioning). role in (admin, installer, viewer) '
  'determina el nivel de acceso via RLS. Un staff "inactive" queda registrado '
  'para trazabilidad pero pierde acceso (helpers is_admin/is_installer '
  'requieren status=active).';

comment on table operations.equipment is
  'Controladora física instalada en un edificio (una controladora = una '
  'puerta). serial_number, building_id, installed_at y replaces_equipment_id '
  'inmutables. Estados: active ↔ maintenance → dead (terminal). Al pasar a '
  'dead, un trigger cierra automáticamente todas sus key_authorizations.';

comment on table operations.key_authorizations is
  'Relación N:M entre rfid_keys y equipment: qué llaves están (o deberían '
  'estar) cargadas en qué equipo. Restringida a llave y equipo del mismo '
  'edificio. sync_state modela el workflow del instalador: '
  'pending_install → installed → pending_removal → removed. Las FKs '
  '(rfid_key_id, equipment_id) son inmutables.';

comment on table sales.products is
  'Catálogo tipológico de lo que Vitalock vende. Sin precio fijo — el precio '
  'se ingresa por venta porque cambia con inflación y negociación. '
  'product_type acota categorías (rfid_key, equipment, installation, etc.); '
  'is_active permite discontinuar sin borrar. Productos inactivos no se '
  'pueden referenciar en nuevos items pero mantienen sus referencias '
  'históricas intactas.';

comment on table sales.quotes is
  'Presupuesto formal a un cliente (típicamente instalaciones). Estado: '
  'draft → sent → accepted/rejected/expired/cancelled. total_amount se '
  'recalcula solo cuando cambian los items. Items solo modificables en draft. '
  'Si se acepta, se crea una bill con from_quote_id apuntando al quote.';

comment on table sales.quote_items is
  'Línea de un quote: descripción libre + producto opcional del catálogo + '
  'cantidad × precio unitario. subtotal se calcula solo. quote_id y unit_id '
  'no se pueden modificar; el resto es libre mientras el quote esté en draft.';

comment on table sales.bills is
  'Cargo formal a una administración (venta ejecutada). Numeración humana '
  'auto: VNT-YYYY-000000. total_amount se recalcula al modificar items. '
  'Estado: draft → confirmed → cancelled (cancelled es terminal y no se '
  'permite si hay payments). from_quote_id opcional linkea al presupuesto '
  'que originó la venta.';

comment on table sales.bill_items is
  'Línea de una bill: producto opcional del catálogo + cantidad × precio '
  'unitario. Trazabilidad opcional via related_key_request_item_id (llave '
  'entregada), related_equipment_id (equipo vendido/instalado) o '
  'related_recurring_charge_id (abono mensual generado automáticamente). '
  'Solo modificable mientras la bill esté en draft.';

comment on table sales.payments is
  'Pago recibido contra una bill. UNIQUE(bill_id): un solo pago por bill '
  '(sin pagos parciales por ahora). amount debe ser exactamente igual a '
  'bill.total_amount. requires_invoice se autocompleta según payment_method '
  '(cash=false, resto=true). invoiced_at lo llena la contadora cuando emite '
  'la factura formal externamente.';

comment on table sales.recurring_charges is
  'Configuración de abono mensual por administración (típicamente '
  'mantenimiento). La función sales.generate_recurring_charges(year, month) '
  'crea las bills del mes evitando duplicados via el link '
  'bill_items.related_recurring_charge_id. is_active=false pausa la '
  'generación sin borrar la configuración.';

comment on table sales.key_requests is
  'Pedido de llaves entrante por WhatsApp / mail / teléfono. requester_type '
  'diferencia auto-autorización (administration) de necesidad de confirmar '
  'con la admin (individual). pickup_person_* (nombre, apellido, DNI) es '
  'inmutable desde que status pasa a authorized — es la garantía de '
  'seguridad de que solo esa persona puede retirar. Estados avanzan solos '
  'via triggers sobre rfid_keys (production + pickup).';

comment on table sales.key_request_items is
  'Línea de un key_request: cuántas llaves para qué unit. La unit debe '
  'pertenecer a un edificio de la administración del request. quantity no '
  'puede reducirse por debajo del número de rfid_keys ya producidas contra '
  'esta línea. Cada rfid_key producida se linkea a esta línea via '
  'key_request_item_id.';

comment on table support.tickets is
  'Ticket de soporte (mantenimiento o instalación) atado a administración + '
  'edificio; opcionalmente a unit y/o equipment. Estados: open → in_progress '
  '→ resolved, con reapertura resolved → in_progress y cancelled desde '
  'cualquiera. Auto-transición: ticket in_progress + equipment_id + '
  'category=maintenance marca automáticamente el equipo como maintenance. '
  'related_bill_id linkea al cargo si el trabajo se factura por evento (NULL '
  'si está cubierto por abono mensual).';

comment on table support.ticket_comments is
  'Timeline de comentarios internos del ticket, append-only por diseño: los '
  'triggers rechazan UPDATE y DELETE (incluso via CASCADE — hace que los '
  'tickets tampoco se puedan borrar). Si hay que corregir un comentario '
  'previo, se agrega uno nuevo aclarándolo.';


-- ============================================================
-- SECCIÓN 8 — LOW: COMMENT ON FUNCTION (todas las que faltan)
-- ============================================================

-- public
comment on function public.set_updated_at is
  'Trigger BEFORE UPDATE compartido: setea NEW.updated_at = now(). Aplicado '
  'a todas las tablas que tienen la columna updated_at.';

comment on function public.rfid_keys_prevent_reassignment is
  'Trigger BEFORE UPDATE: bloquea cambios a unit_id, rfid_code, '
  'key_request_item_id y a los campos picked_up_* una vez seteado '
  'picked_up_at. Inmutabilidad legal de la asignación de la llave.';

comment on function public.rfid_keys_sync_deactivated_at is
  'Trigger BEFORE INSERT/UPDATE: sincroniza deactivated_at con status '
  '(se completa al pasar a disabled/lost, se limpia si vuelve a active).';

comment on function public.rfid_keys_auto_revoke_on_status_change is
  'Trigger AFTER UPDATE OF status: cuando la llave pasa de active a '
  'lost/disabled, invoca revoke_key_from_all_equipment para generar '
  'automáticamente la worklist de removal para el instalador.';

comment on function public.rfid_keys_validate_request_link is
  'Trigger BEFORE INSERT: cuando se produce una rfid_key contra un '
  'key_request_item, valida que la unit coincida, que el request esté en '
  'estado authorized/in_production, y que no se exceda la quantity de la línea.';

comment on function public.rfid_keys_validate_pickup is
  'Trigger BEFORE INSERT/UPDATE de campos de pickup: valida que el DNI del '
  'retirador coincida con pickup_person_dni autorizado en el request, y que '
  'el request esté en ready_for_pickup/delivered.';

comment on function public.rfid_keys_trigger_request_recompute is
  'Trigger AFTER INSERT/UPDATE OF picked_up_at: dispara '
  'sales.recompute_request_status para avanzar el estado del key_request '
  'según cuántas llaves están producidas y cuántas retiradas.';

-- operations
comment on function operations.equipment_prevent_reassignment is
  'Trigger BEFORE UPDATE: bloquea cambios a serial_number, building_id, '
  'replaces_equipment_id, installed_at. Un equipo vive y muere donde se '
  'instaló; los reemplazos son rows nuevas.';

comment on function operations.equipment_sync_decommissioned_at is
  'Trigger BEFORE INSERT/UPDATE: sincroniza decommissioned_at con status=dead. '
  'Se completa al morir, se limpia si por error se marca como dead y se '
  'corrige antes de settle.';

comment on function operations.equipment_validate_replacement is
  'Trigger BEFORE INSERT: valida que replaces_equipment_id (si se seteó) '
  'apunte a un equipo del MISMO edificio y en status=dead. Preserva la '
  'regla "el equipo no cruza edificios" incluso en el flujo de reemplazo.';

comment on function operations.equipment_validate_status_transition is
  'Trigger BEFORE UPDATE OF status: enforce la máquina de estados '
  'active ↔ maintenance, ambos → dead. dead es terminal (transiciones fuera '
  'de dead están prohibidas).';

comment on function operations.equipment_close_authorizations_on_dead is
  'Trigger AFTER UPDATE OF status: cuando el equipo pasa a dead, cierra '
  'todas sus key_authorizations (installed → pending_removal → removed, y '
  'pending_install → removed directamente). Evita autorizaciones colgadas '
  'en equipos que ya no existen físicamente.';

comment on function operations.key_authorizations_prevent_reassignment is
  'Trigger BEFORE UPDATE: bloquea cambios a rfid_key_id y equipment_id. '
  'Una autorización es un hecho histórico; para migrar una llave a otro '
  'equipo se crea otra autorización, no se muta la existente.';

comment on function operations.key_authorizations_validate is
  'Trigger BEFORE INSERT/UPDATE: en INSERT valida que la llave sea active, '
  'el equipo no sea dead, y que ambos estén en el mismo edificio; fuerza '
  'sync_state=pending_install al arrancar. En UPDATE valida transiciones '
  'legales de sync_state.';

comment on function operations.key_authorizations_sync_timestamps is
  'Trigger BEFORE UPDATE: autofilla installed_at cuando sync_state pasa a '
  'installed, y removed_at cuando pasa a removed.';

-- sales
comment on function sales.gen_quote_number is
  'Genera el próximo quote_number con formato PRE-YYYY-000000 (sequence '
  'sales.quote_number_seq, sin reset anual).';

comment on function sales.gen_bill_number is
  'Genera el próximo bill_number con formato VNT-YYYY-000000 (sequence '
  'sales.bill_number_seq, sin reset anual).';

comment on function sales.gen_key_request_number is
  'Genera el próximo request_number con formato REQ-YYYY-000000 (sequence '
  'sales.key_request_number_seq, sin reset anual).';

comment on function sales.compute_item_subtotal is
  'Trigger BEFORE INSERT/UPDATE: computa subtotal = round(quantity × '
  'unit_price, 2). Aplicado a quote_items y bill_items para garantizar '
  'consistencia (nunca se puede pisar el subtotal manualmente).';

comment on function sales.recompute_quote_total is
  'Trigger AFTER INSERT/UPDATE/DELETE en quote_items: recomputa '
  'quotes.total_amount = sum(subtotal). Garantiza que el total del header '
  'siempre matchee la suma de sus líneas.';

comment on function sales.recompute_bill_total is
  'Trigger AFTER INSERT/UPDATE/DELETE en bill_items: recomputa '
  'bills.total_amount = sum(subtotal). Idem quotes.';

comment on function sales.quotes_validate is
  'Trigger BEFORE UPDATE: inmutabilidad de administration_id + máquina de '
  'estados draft → sent → accepted/rejected/expired/cancelled.';

comment on function sales.bills_validate is
  'Trigger BEFORE UPDATE: inmutabilidad de administration_id + from_quote_id, '
  'máquina de estados draft → confirmed → cancelled, cancellation_reason '
  'requerido si status=cancelled.';

comment on function sales.bills_prevent_cancel_with_payments is
  'Trigger BEFORE UPDATE OF status: bloquea confirmed → cancelled si hay '
  'payments existentes. Preserva integridad del balance (una bill cancelada '
  'con pago genera saldo negativo espurio).';

comment on function sales.quote_items_check_parent_editable is
  'Trigger BEFORE INSERT/UPDATE/DELETE: bloquea modificación de items '
  'cuando quotes.status != draft. Un quote enviado no puede cambiar sus '
  'líneas — hay que crear otro.';

comment on function sales.bill_items_check_parent_editable is
  'Trigger BEFORE INSERT/UPDATE/DELETE: bloquea modificación de items '
  'cuando bills.status != draft.';

comment on function sales.validate_product_active_on_reference is
  'Trigger BEFORE INSERT/UPDATE: rechaza si el product_id referenciado tiene '
  'is_active=false. Aplicado a bill_items, quote_items y recurring_charges. '
  'Preserva las referencias históricas: solo restringe nuevas asociaciones.';

comment on function sales.payments_validate is
  'Trigger BEFORE INSERT/UPDATE: autofilla requires_invoice según '
  'payment_method (cash=false, resto=true); en INSERT valida que la bill '
  'esté confirmed, que el amount matchee el total de la bill exactamente '
  '(sin parciales) y que la administration_id coincida; en UPDATE bloquea '
  'cambios a bill_id, amount, payment_method.';

comment on function sales.key_requests_validate is
  'Trigger BEFORE INSERT/UPDATE: valida obligatoriedad de datos según '
  'requester_type (individual necesita más), auto-autoriza requests de '
  'administration, chequea que pickup_person esté completo antes de '
  'authorized, valida transiciones de status (permite saltos hacia adelante '
  'para soportar batch inserts), enforce inmutabilidad de pickup_person '
  'desde authorized.';

comment on function sales.key_request_items_validate is
  'Trigger BEFORE INSERT/UPDATE: valida que la unit sea de un edificio de '
  'la administración del request; en UPDATE bloquea cambio de '
  'key_request_id/unit_id y prohíbe reducir quantity por debajo del número '
  'de rfid_keys ya producidas.';

comment on function sales.recompute_request_status is
  'Función helper: recalcula key_requests.status basándose en cuántas '
  'rfid_keys existen linkeadas y cuántas tienen picked_up_at. Invocada por '
  'triggers sobre rfid_keys, no directamente por la app.';

-- support
comment on function support.gen_ticket_number is
  'Genera el próximo ticket_number con formato SOP-YYYY-000000 (sequence '
  'support.ticket_number_seq, sin reset anual).';

comment on function support.tickets_validate is
  'Trigger BEFORE INSERT/UPDATE: valida coherencia cruzada '
  '(building ∈ administration, unit ∈ building, equipment ∈ building), '
  'motivos requeridos por estado (resolution_notes si resolved, '
  'cancellation_reason si cancelled), inmutabilidades de scope '
  '(administration/building/category/opened_*), máquina de estados con '
  'reapertura, autofill de resolved_at.';

comment on function support.auto_transition_equipment_on_maintenance is
  'Trigger AFTER INSERT/UPDATE OF status: cuando un ticket con equipment_id + '
  'category=maintenance pasa a in_progress, marca automáticamente el '
  'equipo como maintenance (solo si estaba active). La vuelta a active es '
  'manual por decisión del admin.';

comment on function support.enforce_installer_ticket_column_restrictions is
  'Trigger BEFORE UPDATE: cuando el que updatea es un installer '
  '(current_staff_role()="installer"), rechaza cambios a assigned_to, '
  'unit_id, equipment_id, description, related_*, cancellation_reason. '
  'Complemento column-level a las policies RLS que solo scope-an por row.';

comment on function support.ticket_comments_prevent_modification is
  'Trigger BEFORE UPDATE/DELETE: rechaza toda modificación o borrado de '
  'comentarios (append-only). Efecto secundario: hace que tickets tampoco '
  'se puedan borrar (el DELETE cascade a comments falla).';
