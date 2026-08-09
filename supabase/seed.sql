-- Sample data for local development / manual testing.
-- Every rfid_key belongs to a unit; administrative keys live in the building's
-- is_administrative unit slot.

------------------------------------------------------------
-- administrations
------------------------------------------------------------
insert into public.administrations (id, company_name, tax_id, email, phone, address, status, notes) values
  ('11111111-1111-1111-1111-111111111111',
   'Administracion Central SRL',
   '30-71234567-8',
   'contacto@admincentral.com.ar',
   '+54 11 4555-1000',
   'Av. Corrientes 1234, CABA',
   'active',
   'Cliente insignia, tres edificios activos.'),
  ('22222222-2222-2222-2222-222222222222',
   'Consorcios del Sur SA',
   '30-70999888-1',
   'info@consorciosdelsur.com',
   '+54 11 4222-3300',
   'Av. Belgrano 500, CABA',
   'active',
   null);

------------------------------------------------------------
-- buildings
------------------------------------------------------------
insert into public.buildings (id, administration_id, name, address, city, status, notes) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
   '11111111-1111-1111-1111-111111111111',
   'Torre Callao',
   'Av. Callao 800',
   'CABA',
   'active',
   'Torre residencial 12 pisos.'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
   '11111111-1111-1111-1111-111111111111',
   'Edificio Palermo Loft',
   'Gorriti 5200',
   'CABA',
   'active',
   null),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
   '22222222-2222-2222-2222-222222222222',
   'Complejo Barracas',
   'Av. Montes de Oca 1400',
   'CABA',
   'active',
   'Uso mixto: departamentos y locales.');

------------------------------------------------------------
-- units
------------------------------------------------------------
-- Torre Callao: departamentos + slot administrativo.
insert into public.units (id, building_id, number, unit_type, is_administrative, status, notes) values
  ('cccccccc-cccc-cccc-cccc-ccccccccccc0',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
   '00', 'administrativa', true, 'active', 'Slot para llaves administrativas del edificio.'),
  ('cccccccc-cccc-cccc-cccc-ccccccccccc1',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
   '101', 'departamento', false, 'active', null),
  ('cccccccc-cccc-cccc-cccc-ccccccccccc2',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
   '102', 'departamento', false, 'active', null),
  ('cccccccc-cccc-cccc-cccc-ccccccccccc3',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
   '201', 'departamento', false, 'active', null);

-- Palermo Loft: solo departamentos (sin llaves administrativas por ahora).
insert into public.units (id, building_id, number, unit_type, is_administrative, status, notes) values
  ('dddddddd-dddd-dddd-dddd-ddddddddddd1',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
   'A-201', 'departamento', false, 'active', null),
  ('dddddddd-dddd-dddd-dddd-ddddddddddd2',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
   'B-201', 'departamento', false, 'inactive', 'En obra hasta fin de trimestre.');

-- Complejo Barracas: uso mixto + slot administrativo.
insert into public.units (id, building_id, number, unit_type, is_administrative, status, notes) values
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee0',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
   '00', 'administrativa', true, 'active', 'Slot para llaves administrativas del edificio.'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
   '101', 'departamento', false, 'active', null),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee2',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
   'Local 1', 'local', false, 'active', 'Comercio a la calle.'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee3',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
   'Local 2', 'local', false, 'active', null);

------------------------------------------------------------
-- rfid_keys (all belong to a unit; admin ones live in the '00' unit)
------------------------------------------------------------
insert into public.rfid_keys
  (rfid_code, unit_id, status, notes, activated_at) values

  -- Torre Callao 101: dos activas + una perdida.
  ('RFID-TC-101-001', 'cccccccc-cccc-cccc-cccc-ccccccccccc1', 'active', 'Titular: Perez, Juan.',            now() - interval '90 days'),
  ('RFID-TC-101-002', 'cccccccc-cccc-cccc-cccc-ccccccccccc1', 'active', 'Titular: Perez, Ana (esposa).',    now() - interval '90 days'),
  ('RFID-TC-101-003', 'cccccccc-cccc-cccc-cccc-ccccccccccc1', 'lost',   'Reportada perdida el 2026-04-12.', now() - interval '120 days'),

  -- Torre Callao 102: una activa + una desactivada.
  ('RFID-TC-102-001', 'cccccccc-cccc-cccc-cccc-ccccccccccc2', 'active',   null,                        now() - interval '30 days'),
  ('RFID-TC-102-002', 'cccccccc-cccc-cccc-cccc-ccccccccccc2', 'disabled', 'Ex inquilino, desalojada.', now() - interval '200 days'),

  -- Torre Callao 201.
  ('RFID-TC-201-001', 'cccccccc-cccc-cccc-cccc-ccccccccccc3', 'active', null, now() - interval '15 days'),

  -- Palermo Loft A-201.
  ('RFID-PL-A201-001', 'dddddddd-dddd-dddd-dddd-ddddddddddd1', 'active', null, now() - interval '10 days'),
  ('RFID-PL-A201-002', 'dddddddd-dddd-dddd-dddd-ddddddddddd1', 'active', null, now() - interval '10 days'),

  -- Complejo Barracas 101.
  ('RFID-CB-101-001', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1', 'active', null, now() - interval '60 days'),

  -- Complejo Barracas Local 1.
  ('RFID-CB-LOC1-001', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee2', 'active', 'Comprador: Cafeteria El Rincon.', now() - interval '45 days'),

  -- Torre Callao — unidad administrativa (00).
  ('RFID-TC-ADM-001', 'cccccccc-cccc-cccc-cccc-ccccccccccc0', 'active', 'Para: Portero titular.',      now() - interval '365 days'),
  ('RFID-TC-ADM-002', 'cccccccc-cccc-cccc-cccc-ccccccccccc0', 'active', 'Para: Personal de limpieza.', now() - interval '365 days'),
  ('RFID-TC-ADM-003', 'cccccccc-cccc-cccc-cccc-ccccccccccc0', 'lost',   'Perdida en operativo mantenimiento.', now() - interval '200 days'),

  -- Complejo Barracas — unidad administrativa (00).
  ('RFID-CB-ADM-001', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee0', 'active',   'Para: Administrador general.', now() - interval '150 days'),
  ('RFID-CB-ADM-002', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee0', 'disabled', 'Para: Ex empleado.',           now() - interval '400 days');

------------------------------------------------------------
-- identity.staff
------------------------------------------------------------
insert into identity.staff (id, full_name, email, phone, role, status, notes) values
  ('99999999-9999-9999-9999-999999999901',
   'Ana Alvarez',      'ana@vitalock.example',       '+54 11 5000-0001', 'admin',     'active',   'Backoffice, alta y baja de llaves.'),
  ('99999999-9999-9999-9999-999999999902',
   'Bruno Benitez',    'bruno@vitalock.example',     '+54 11 5000-0002', 'installer', 'active',   'Zona norte.'),
  ('99999999-9999-9999-9999-999999999903',
   'Carla Cordoba',    'carla@vitalock.example',     '+54 11 5000-0003', 'installer', 'active',   'Zona sur.'),
  ('99999999-9999-9999-9999-999999999905',
   'Elena Espinoza',   'elena@vitalock.example',     '+54 11 5000-0005', 'installer', 'inactive', 'De licencia.');

------------------------------------------------------------
-- operations.equipment
------------------------------------------------------------
-- Torre Callao: dos controladoras activas + una muerta (reemplazada).
insert into operations.equipment
  (id, serial_number, model, building_id, description, access_type, status, installed_at, notes) values
  ('f0000000-0000-0000-0000-000000000001',
   'SN-TC-PEATONAL-01', 'ACX-500', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
   'Controladora porton peatonal', 'peatonal', 'active', now() - interval '400 days', null),
  ('f0000000-0000-0000-0000-000000000002',
   'SN-TC-COCHERA-01',  'ACX-500', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
   'Controladora porton cochera',  'cochera',  'active', now() - interval '400 days', null),
  ('f0000000-0000-0000-0000-000000000003',
   'SN-TC-SERVICE-OLD', 'ACX-300', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
   'Controladora entrada servicio (equipo original, quemado)', 'service', 'dead',
   now() - interval '500 days', 'Placa quemada por descarga electrica en 2026-05.');

insert into operations.equipment
  (id, serial_number, model, building_id, description, access_type, status, installed_at, replaces_equipment_id) values
  ('f0000000-0000-0000-0000-000000000004',
   'SN-TC-SERVICE-02', 'ACX-500', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
   'Controladora entrada servicio (reemplazo)', 'service', 'active',
   now() - interval '50 days', 'f0000000-0000-0000-0000-000000000003');

-- Palermo Loft: equipo en mantenimiento.
insert into operations.equipment
  (id, serial_number, model, building_id, description, access_type, status, installed_at, notes) values
  ('f0000000-0000-0000-0000-000000000005',
   'SN-PL-PEATONAL-01', 'ACX-500', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
   'Controladora unica peatonal', 'peatonal', 'maintenance', now() - interval '300 days',
   'Retirado 2026-08-01 por falla intermitente del lector.');

-- Complejo Barracas: dos controladoras activas.
insert into operations.equipment
  (id, serial_number, model, building_id, description, access_type, status, installed_at) values
  ('f0000000-0000-0000-0000-000000000006',
   'SN-CB-PEATONAL-01', 'ACX-500', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
   'Controladora porton peatonal', 'peatonal', 'active', now() - interval '250 days'),
  ('f0000000-0000-0000-0000-000000000007',
   'SN-CB-LOCALES-01',  'ACX-500', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
   'Controladora ingreso locales', 'other', 'active', now() - interval '250 days');

------------------------------------------------------------
-- operations.key_authorizations
------------------------------------------------------------

-- Torre Callao / peatonal — todas las active del edificio deberian estar cargadas.
insert into operations.key_authorizations (rfid_key_id, equipment_id, notes)
select k.id,
       'f0000000-0000-0000-0000-000000000001',
       'Alta batch por instalacion inicial.'
from public.rfid_keys k
join public.units u on u.id = k.unit_id
where u.building_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'
  and k.status = 'active';

update operations.key_authorizations
   set sync_state          = 'installed',
       installed_by_staff_id = '99999999-9999-9999-9999-999999999902'
 where equipment_id = 'f0000000-0000-0000-0000-000000000001';

-- Torre Callao / cochera — solo las del depto 101 (para variar).
insert into operations.key_authorizations (rfid_key_id, equipment_id, notes)
select k.id,
       'f0000000-0000-0000-0000-000000000002',
       null
from public.rfid_keys k
where k.unit_id = 'cccccccc-cccc-cccc-cccc-ccccccccccc1'
  and k.status = 'active';

update operations.key_authorizations
   set sync_state = 'installed',
       installed_by_staff_id = '99999999-9999-9999-9999-999999999902'
 where equipment_id = 'f0000000-0000-0000-0000-000000000002'
   and sync_state = 'pending_install';

-- Complejo Barracas / peatonal — CB-101-001 installed; CB-LOC1-001 pendiente.
insert into operations.key_authorizations (rfid_key_id, equipment_id, notes)
select id,
       'f0000000-0000-0000-0000-000000000006',
       'Alta primera tanda.'
from public.rfid_keys
where rfid_code in ('RFID-CB-101-001', 'RFID-CB-LOC1-001');

update operations.key_authorizations
   set sync_state            = 'installed',
       installed_by_staff_id = '99999999-9999-9999-9999-999999999903'
 where equipment_id = 'f0000000-0000-0000-0000-000000000006'
   and rfid_key_id  = (select id from public.rfid_keys where rfid_code = 'RFID-CB-101-001');

-- Ejemplo pending_removal: llave cargada en controladora de locales que la
-- administracion pidio dar de baja.
insert into operations.key_authorizations (rfid_key_id, equipment_id, notes)
values (
  (select id from public.rfid_keys where rfid_code = 'RFID-CB-LOC1-001'),
  'f0000000-0000-0000-0000-000000000007',
  'Autorizacion adicional en controladora de locales.'
);
update operations.key_authorizations
   set sync_state            = 'installed',
       installed_by_staff_id = '99999999-9999-9999-9999-999999999903'
 where equipment_id = 'f0000000-0000-0000-0000-000000000007'
   and rfid_key_id  = (select id from public.rfid_keys where rfid_code = 'RFID-CB-LOC1-001');
update operations.key_authorizations
   set sync_state    = 'pending_removal',
       remove_reason = 'Baja solicitada por administracion.'
 where equipment_id = 'f0000000-0000-0000-0000-000000000007'
   and rfid_key_id  = (select id from public.rfid_keys where rfid_code = 'RFID-CB-LOC1-001');

------------------------------------------------------------
-- sales.key_requests + key_request_items
------------------------------------------------------------
-- Tres ejemplos cubriendo:
--   REQ #1: pedido de la ADMIN (auto-autorizado), multi-linea, ya entregado
--   REQ #2: pedido de PARTICULAR, pendiente de autorizacion
--   REQ #3: pedido de la ADMIN, en produccion (algunas producidas, faltan otras)

------------------------------------------------------------
-- REQ #1 — admin de Torre Callao pide reposicion multi-linea, ya entregada
------------------------------------------------------------
insert into sales.key_requests (
  id, administration_id, requester_type,
  requester_name, requester_contact,
  pickup_person_name, pickup_person_surname, pickup_person_dni,
  received_at, received_by_staff_id,
  authorization_method, authorized_by, authorized_at,
  notes
) values (
  '77777777-7777-7777-7777-777777777701',
  '11111111-1111-1111-1111-111111111111',
  'administration',
  'Marcela (Admin Central)', '+54 11 4555-1000',
  'Roberto', 'Gomez', '20345678',
  now() - interval '20 days', '99999999-9999-9999-9999-999999999901',
  'whatsapp', 'Marcela (Admin Central)', now() - interval '20 days',
  'Reposicion mensual de llaves.'
);
-- El trigger auto-transiciono el estado a 'authorized' por ser admin.

-- Linea 1: 2 llaves para depto 101 de Torre Callao.
insert into sales.key_request_items (id, key_request_id, unit_id, quantity, notes) values
  ('88888888-8888-8888-8888-888888888801',
   '77777777-7777-7777-7777-777777777701',
   'cccccccc-cccc-cccc-cccc-ccccccccccc1',
   2, 'Reposicion nuevo inquilino.');

-- Linea 2: 1 llave administrativa (para el portero suplente).
insert into sales.key_request_items (id, key_request_id, unit_id, quantity, notes) values
  ('88888888-8888-8888-8888-888888888802',
   '77777777-7777-7777-7777-777777777701',
   'cccccccc-cccc-cccc-cccc-ccccccccccc0',
   1, 'Portero suplente fines de semana.');

-- Se producen las 3 llaves (nacen ligadas a las lineas).
insert into public.rfid_keys (rfid_code, unit_id, status, notes, activated_at, key_request_item_id) values
  ('RFID-REQ1-001', 'cccccccc-cccc-cccc-cccc-ccccccccccc1', 'active', 'Reposicion 101.',
   now() - interval '15 days', '88888888-8888-8888-8888-888888888801'),
  ('RFID-REQ1-002', 'cccccccc-cccc-cccc-cccc-ccccccccccc1', 'active', 'Reposicion 101.',
   now() - interval '15 days', '88888888-8888-8888-8888-888888888801'),
  ('RFID-REQ1-003', 'cccccccc-cccc-cccc-cccc-ccccccccccc0', 'active', 'Portero suplente.',
   now() - interval '15 days', '88888888-8888-8888-8888-888888888802');

-- Roberto Gomez pasa a retirar las 3.
update public.rfid_keys
   set picked_up_at         = now() - interval '10 days',
       picked_up_by_name    = 'Roberto',
       picked_up_by_surname = 'Gomez',
       picked_up_by_dni     = '20345678',
       delivered_by_staff_id = '99999999-9999-9999-9999-999999999901'
 where rfid_code in ('RFID-REQ1-001','RFID-REQ1-002','RFID-REQ1-003');
-- Trigger auto-transiciona la solicitud a 'delivered'.

------------------------------------------------------------
-- REQ #2 — particular de Palermo Loft (A-201), pendiente de autorizacion
------------------------------------------------------------
insert into sales.key_requests (
  id, administration_id, requester_type,
  requester_name, requester_surname, requester_dni, requester_contact,
  received_at, received_by_staff_id,
  notes
) values (
  '77777777-7777-7777-7777-777777777702',
  '11111111-1111-1111-1111-111111111111',  -- Palermo Loft es de Admin Central
  'individual',
  'Sofia', 'Ramirez', '35123456', '+54 11 6100-2222',
  now() - interval '2 days', '99999999-9999-9999-9999-999999999901',
  'Solicita 1 llave nueva. Pendiente de confirmar con admin.'
);

insert into sales.key_request_items (key_request_id, unit_id, quantity, notes) values
  ('77777777-7777-7777-7777-777777777702',
   'dddddddd-dddd-dddd-dddd-ddddddddddd1',
   1, 'Solicitante dice ser propietaria del A-201.');

------------------------------------------------------------
-- REQ #3 — admin de Complejo Barracas, en produccion (parcial)
------------------------------------------------------------
insert into sales.key_requests (
  id, administration_id, requester_type,
  requester_name, requester_contact,
  pickup_person_name, pickup_person_surname, pickup_person_dni,
  received_at, received_by_staff_id,
  authorization_method, authorized_by, authorized_at,
  notes
) values (
  '77777777-7777-7777-7777-777777777703',
  '22222222-2222-2222-2222-222222222222',
  'administration',
  'Luis (Consorcios del Sur)', '+54 11 4222-3300',
  'Luis', 'Fernandez', '18765432',
  now() - interval '5 days', '99999999-9999-9999-9999-999999999901',
  'whatsapp', 'Luis (Consorcios del Sur)', now() - interval '5 days',
  'Reemplazo de tarjetas perdidas del Local 2.'
);

insert into sales.key_request_items (id, key_request_id, unit_id, quantity, notes) values
  ('88888888-8888-8888-8888-888888888803',
   '77777777-7777-7777-7777-777777777703',
   'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee3',  -- Local 2
   3, 'Set completo del comercio.');

-- Solo se produjeron 2 de 3 hasta ahora.
insert into public.rfid_keys (rfid_code, unit_id, status, notes, activated_at, key_request_item_id) values
  ('RFID-REQ3-001', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee3', 'active', 'Local 2 - card 1.',
   now() - interval '3 days', '88888888-8888-8888-8888-888888888803'),
  ('RFID-REQ3-002', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee3', 'active', 'Local 2 - card 2.',
   now() - interval '3 days', '88888888-8888-8888-8888-888888888803');
-- La 3ra falta producir; la solicitud debe estar en 'in_production'.

------------------------------------------------------------
-- sales.products (catálogo)
------------------------------------------------------------
insert into sales.products (id, name, product_type, description, is_active) values
  ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'Llave RFID',                       'rfid_key',                'Tarjeta RFID magnetica individual.', true),
  ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a2', 'Cerradura magnetica ACX-500',      'equipment',               'Controladora estandar para acceso peatonal.', true),
  ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a3', 'Cerradura magnetica ACX-300',     'equipment',                'Controladora modelo economico.', true),
  ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a4', 'Instalacion de cerradura',        'installation',             'Instalacion, cableado y puesta en marcha.', true),
  ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a5', 'Mantenimiento mensual',           'maintenance_recurring',    'Abono mensual que cubre eventualidades y urgencias.', true),
  ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a6', 'Mantenimiento normal',            'maintenance_one_time',     'Visita tecnica de mantenimiento estandar.', true),
  ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a7', 'Reemplazo de equipo',             'equipment_replacement',    'Reemplazo de controladora + instalacion.', true),
  ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a8', 'Instalacion camara CCTV / WiFi',  'cctv_wifi_installation',   'Camaras de seguridad e infraestructura WiFi.', true);

------------------------------------------------------------
-- sales.recurring_charges (abonos mensuales)
------------------------------------------------------------
-- Las dos administraciones tienen abono mensual de mantenimiento.
insert into sales.recurring_charges (id, administration_id, product_id, description, monthly_amount, start_date) values
  ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b101',
   '11111111-1111-1111-1111-111111111111',
   'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a5',
   'Mantenimiento mensual - Administracion Central (todos los edificios)',
   65000.00,
   date_trunc('month', now() - interval '6 months')::date),
  ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b102',
   '22222222-2222-2222-2222-222222222222',
   'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a5',
   'Mantenimiento mensual - Consorcios del Sur (Complejo Barracas)',
   65000.00,
   date_trunc('month', now() - interval '3 months')::date);

------------------------------------------------------------
-- sales.quotes — presupuesto de instalacion (aceptado, convertido en bill)
------------------------------------------------------------
insert into sales.quotes (id, administration_id, status, valid_until, notes, created_by_staff_id) values
  ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c101',
   '22222222-2222-2222-2222-222222222222',
   'draft',
   (now() + interval '30 days')::date,
   'Presupuesto instalacion de 2 cerraduras en Local 2.',
   '99999999-9999-9999-9999-999999999901');

insert into sales.quote_items (quote_id, product_id, description, quantity, unit_price) values
  ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c101',
   'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a2',
   'Cerradura magnetica ACX-500 (2 unidades)', 2, 380000.00),
  ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c101',
   'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a4',
   'Instalacion de 2 cerraduras (peatonal + cochera)', 1, 250000.00);

-- Volvemos al flujo normal: draft -> sent -> accepted.
update sales.quotes set status = 'sent', sent_at = now() - interval '15 days'
 where id = 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c101';
update sales.quotes set status = 'accepted', accepted_at = now() - interval '10 days'
 where id = 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c101';

------------------------------------------------------------
-- sales.bills — 3 escenarios
------------------------------------------------------------

-- BILL #1: cargo por las llaves entregadas de REQ-2026-000001 (draft).
-- Se armo despues de la entrega. Precio negociado con la admin.
insert into sales.bills (id, administration_id, charge_date, notes, created_by_staff_id) values
  ('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d101',
   '11111111-1111-1111-1111-111111111111',
   (now() - interval '9 days')::date,
   'Cargo por 3 llaves entregadas en REQ-2026-000001.',
   '99999999-9999-9999-9999-999999999901');

insert into sales.bill_items (bill_id, product_id, description, quantity, unit_price, related_key_request_item_id) values
  ('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d101',
   'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',
   'Llaves RFID reposicion depto 101', 2, 18000.00,
   '88888888-8888-8888-8888-888888888801'),
  ('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d101',
   'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',
   'Llave RFID portero suplente (administrativa)', 1, 15000.00,
   '88888888-8888-8888-8888-888888888802');

update sales.bills set status = 'confirmed' where id = 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d101';

-- Se pago por transferencia. Requiere factura (aun pendiente).
insert into sales.payments (administration_id, bill_id, payment_date, amount, payment_method, reference) values
  ('11111111-1111-1111-1111-111111111111',
   'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d101',
   (now() - interval '5 days')::date,
   51000.00,
   'transfer',
   'TRF-00987654');

-- BILL #2: convertido desde quote aceptado (instalacion 2 cerraduras en Local 2).
insert into sales.bills (id, administration_id, charge_date, from_quote_id, notes, created_by_staff_id) values
  ('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d102',
   '22222222-2222-2222-2222-222222222222',
   (now() - interval '8 days')::date,
   'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c101',
   'Instalacion 2 cerraduras Local 2 - convertido del PRE.',
   '99999999-9999-9999-9999-999999999901');

insert into sales.bill_items (bill_id, product_id, description, quantity, unit_price) values
  ('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d102',
   'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a2',
   'Cerradura magnetica ACX-500 (2 unidades)', 2, 380000.00),
  ('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d102',
   'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a4',
   'Instalacion de 2 cerraduras', 1, 250000.00);

update sales.bills set status = 'confirmed' where id = 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d102';

-- Se pago en efectivo. NO requiere factura.
insert into sales.payments (administration_id, bill_id, payment_date, amount, payment_method, reference) values
  ('22222222-2222-2222-2222-222222222222',
   'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d102',
   (now() - interval '7 days')::date,
   1010000.00,
   'cash',
   null);

-- BILL #3: cargo del mes actual del mantenimiento (Admin Central) — draft (aun no confirmado ni cobrado).
insert into sales.bills (id, administration_id, charge_date, notes, created_by_staff_id) values
  ('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d103',
   '11111111-1111-1111-1111-111111111111',
   date_trunc('month', now())::date,
   'Mantenimiento mensual - cargo del mes actual.',
   '99999999-9999-9999-9999-999999999901');

insert into sales.bill_items (bill_id, product_id, description, quantity, unit_price, related_recurring_charge_id) values
  ('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d103',
   'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a5',
   'Mantenimiento mensual - Administracion Central', 1, 65000.00,
   'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b101');

update sales.bills set status = 'confirmed' where id = 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d103';
-- Sin pago aun: la admin debe $65000.

------------------------------------------------------------
-- support.tickets — 3 escenarios
------------------------------------------------------------

-- TICKET #1: open, sin asignar, sobre el edificio completo (fallo general).
insert into support.tickets (id, administration_id, building_id, category, description, opened_at, opened_by_staff_id) values
  ('11111111-2222-3333-4444-555555555501',
   '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
   'maintenance',
   'Consorcio reporta que ninguna puerta del edificio abre desde hace 1 hora. Posible corte de electricidad en el tablero.',
   now() - interval '2 hours',
   '99999999-9999-9999-9999-999999999901');

-- TICKET #2: in_progress, asignado a Bruno, sobre un equipo especifico.
-- Esto auto-transiciona el equipo a maintenance.
insert into support.tickets (id, administration_id, building_id, equipment_id, category, description, opened_at, opened_by_staff_id, assigned_to_staff_id) values
  ('11111111-2222-3333-4444-555555555502',
   '22222222-2222-2222-2222-222222222222',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
   'f0000000-0000-0000-0000-000000000007',   -- SN-CB-LOCALES-01
   'maintenance',
   'La controladora de locales no lee tarjetas correctamente. Necesita revision.',
   now() - interval '1 day',
   '99999999-9999-9999-9999-999999999901',
   '99999999-9999-9999-9999-999999999903');  -- Carla

update support.tickets
   set status = 'in_progress'
 where id = '11111111-2222-3333-4444-555555555502';
-- Trigger auto-transiciona equipment f0000000-...007 a 'maintenance'.

-- TICKET #3: resolved, instalacion de 2 cerraduras Local 2 (vinculado a bill #2).
insert into support.tickets (id, administration_id, building_id, unit_id, category, description, opened_at, opened_by_staff_id, assigned_to_staff_id, related_bill_id) values
  ('11111111-2222-3333-4444-555555555503',
   '22222222-2222-2222-2222-222222222222',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
   'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee3',   -- Local 2
   'installation',
   'Instalar 2 cerraduras magneticas en Local 2 segun presupuesto PRE-2026-000001.',
   now() - interval '9 days',
   '99999999-9999-9999-9999-999999999901',
   '99999999-9999-9999-9999-999999999902',   -- Bruno
   'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d102'); -- bill de la instalacion

-- Movemos por el flujo: open -> in_progress -> resolved
update support.tickets set status = 'in_progress' where id = '11111111-2222-3333-4444-555555555503';
update support.tickets set status = 'resolved',
                          resolved_by_staff_id = '99999999-9999-9999-9999-999999999902',
                          resolution_notes = 'Instalacion completada. Ambas cerraduras probadas y funcionando.'
 where id = '11111111-2222-3333-4444-555555555503';

------------------------------------------------------------
-- support.ticket_comments
------------------------------------------------------------
-- Comentarios en el ticket de instalacion resuelto.
insert into support.ticket_comments (ticket_id, author_staff_id, body, created_at) values
  ('11111111-2222-3333-4444-555555555503',
   '99999999-9999-9999-9999-999999999901',
   'Coordinado con la administracion para instalar el jueves 09:00.',
   now() - interval '8 days'),
  ('11111111-2222-3333-4444-555555555503',
   '99999999-9999-9999-9999-999999999902',
   'Llegue al sitio. Empezando instalacion.',
   now() - interval '7 days' + interval '9 hours'),
  ('11111111-2222-3333-4444-555555555503',
   '99999999-9999-9999-9999-999999999902',
   'Falto material para el cableado. Consegui en la ferreteria de al lado.',
   now() - interval '7 days' + interval '11 hours'),
  ('11111111-2222-3333-4444-555555555503',
   '99999999-9999-9999-9999-999999999902',
   'Instalacion terminada. Probando con llaves administrativas.',
   now() - interval '7 days' + interval '13 hours');

-- Comentario en el ticket abierto del edificio.
insert into support.ticket_comments (ticket_id, author_staff_id, body, created_at) values
  ('11111111-2222-3333-4444-555555555501',
   '99999999-9999-9999-9999-999999999901',
   'Consultado con administrador, confirma que el UPS del tablero se apago. Pendiente coordinar visita tecnica.',
   now() - interval '1 hour');

------------------------------------------------------------
-- auth users for local dev testing
-- LOCAL DEV ONLY — never use in production.
-- These rows are NOT representative of production provisioning.
-- Production users are created via Supabase Auth admin API.
-- Passwords are intentionally weak — never use in production.
------------------------------------------------------------

-- Ana Alvarez (admin)
INSERT INTO auth.users (
  id, instance_id, email, aud, role,
  encrypted_password,
  email_confirmed_at, created_at, updated_at
) VALUES (
  'aa000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'ana@vitalock.example',
  'authenticated', 'authenticated',
  crypt('admin1234', gen_salt('bf')),
  now(), now(), now()
) ON CONFLICT (id) DO NOTHING;

-- Bruno Benitez (installer)
INSERT INTO auth.users (
  id, instance_id, email, aud, role,
  encrypted_password,
  email_confirmed_at, created_at, updated_at
) VALUES (
  'bb000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'bruno@vitalock.example',
  'authenticated', 'authenticated',
  crypt('installer1234', gen_salt('bf')),
  now(), now(), now()
) ON CONFLICT (id) DO NOTHING;

-- Link auth.users to identity.staff
UPDATE identity.staff
  SET auth_user_id = 'aa000000-0000-0000-0000-000000000001'
  WHERE id = '99999999-9999-9999-9999-999999999901';  -- Ana Alvarez

UPDATE identity.staff
  SET auth_user_id = 'bb000000-0000-0000-0000-000000000001'
  WHERE id = '99999999-9999-9999-9999-999999999902';  -- Bruno Benitez

