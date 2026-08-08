# Vitalock — Base de datos

Esquema compartido de los servicios de Vitalock (sistema de gestión para venta
e instalación de controles de acceso RFID magnéticos). Organizado en varios
**schemas** de una sola base Postgres — cada schema pertenece conceptualmente
a un microservicio pero conviven físicamente para permitir FKs reales entre
ellos.

> **📖 Ver también [`FLOWS.md`](./FLOWS.md)** — capacidades por dominio,
> flujos de negocio resueltos paso a paso, invariantes que la DB garantiza
> automáticamente, y qué queda fuera del alcance actual.

**Última auditoría**: 2026-08-08 (migración `20260808000017`). 100% de
tablas y funciones tienen `COMMENT ON` con documentación inline
consultable desde `psql`, Studio o cualquier herramienta ORM/de
introspección (`\d+`, `\df+`, DBeaver, etc.).

## Servicios implementados

| Schema        | Servicio                                | Estado |
|---------------|-----------------------------------------|--------|
| `public`      | Customer Service                        | ✅     |
| `identity`    | Staff / usuarios internos               | ✅     |
| `operations`  | Equipos y autorizaciones de llaves      | ✅     |
| `sales`       | Solicitudes, cargos, cobros, presupuestos, abonos | ✅ |
| `support`     | Tickets de mantenimiento e instalación  | ✅     |

## Modelo

```mermaid
erDiagram
  ADMINISTRATIONS ||--o{ BUILDINGS   : owns
  BUILDINGS       ||--o{ UNITS       : contains
  UNITS           ||--o{ RFID_KEYS   : issues
  BUILDINGS       ||--o{ EQUIPMENT   : hosts
  EQUIPMENT       ||--o{ KEY_AUTHORIZATIONS  : "loaded with"
  RFID_KEYS       ||--o{ KEY_AUTHORIZATIONS  : "authorized on"
  STAFF           ||--o{ KEY_AUTHORIZATIONS  : "installed / removed by"
  EQUIPMENT       ||--o| EQUIPMENT           : "replaces (dead)"

  ADMINISTRATIONS { uuid id PK; text company_name; text tax_id; text status }
  BUILDINGS       { uuid id PK; uuid administration_id FK; text name; text status }
  UNITS {
    uuid id PK
    uuid building_id FK
    text number "unique per building"
    text unit_type
    bool is_administrative "at most one per building"
    text status
  }
  RFID_KEYS {
    uuid id PK
    text rfid_code "globally unique"
    uuid unit_id FK "NOT NULL, immutable"
    text status "active | disabled | lost"
    text notes "free text (buyer name, admin role, ...)"
  }
  STAFF {
    uuid id PK
    uuid auth_user_id FK "nullable"
    text full_name
    text role "admin | installer | viewer"
    text status
  }
  EQUIPMENT {
    uuid id PK
    text serial_number "globally unique, immutable"
    uuid building_id FK "immutable"
    text description
    text access_type "peatonal | cochera | ..."
    text status "active | maintenance | dead"
    uuid replaces_equipment_id FK "same building"
  }
  KEY_AUTHORIZATIONS {
    uuid id PK
    uuid rfid_key_id FK "immutable"
    uuid equipment_id FK "immutable"
    text sync_state "pending_install | installed | pending_removal | removed"
    uuid installed_by_staff_id FK
    uuid removed_by_staff_id FK
  }
```

## Decisiones clave

### Toda llave pertenece a una unidad

`rfid_keys.unit_id` es `NOT NULL` e inmutable. No hay dualidad "llave de unidad
vs. llave administrativa" a nivel schema — todas las llaves apuntan a una
unidad.

Las llaves administrativas (portería, mantenimiento, emergencias) viven en una
**unidad marcada como administrativa**: cada edificio puede tener **como
máximo una** unidad con `is_administrative = true` (unique index parcial).
El "para quién es" queda como texto en `rfid_keys.notes`.

Trazabilidad legal: `key → unit → building → administration`, uniforme.

### Titularidad vs autorización

Las llaves tienen dos dimensiones separadas por diseño:

- **Titularidad** (`rfid_keys`): a qué unidad pertenece. Inmutable después de
  la creación. Es un hecho legal/comercial.
- **Autorización** (`operations.key_authorizations`): en qué equipos físicos
  está cargada la llave. N:M contra `equipment`, con estado operativo
  (`sync_state`). Una misma llave puede estar cargada en múltiples equipos
  del edificio (peatonal + cochera + …). **Nunca cruza edificios** — un
  trigger enforce que `equipment.building_id = unit.building_id`.

### Inmutabilidad de asignaciones

Enforcado por triggers `BEFORE UPDATE` que lanzan `check_violation`. La regla
vive en la DB, no en la app.

| Tabla                 | Campos inmutables                                      |
|-----------------------|--------------------------------------------------------|
| `rfid_keys`           | `unit_id`, `rfid_code`                                 |
| `equipment`           | `serial_number`, `building_id`, `replaces_equipment_id`, `installed_at` |
| `key_authorizations`  | `rfid_key_id`, `equipment_id`                          |

### Ciclo de vida del equipo

```
   active ↔ maintenance
      ↓         ↓
      └────►  dead   (terminal)
```

Enforcado por trigger. `dead → *` está bloqueado. Cuando un equipo pasa a
`dead`, un trigger `AFTER UPDATE` cierra automáticamente sus
`key_authorizations` (`installed → pending_removal → removed`, y
`pending_install → removed`).

Reemplazo: `operations.replace_equipment(...)` es una función que atómicamente
mata el viejo y crea el nuevo con `replaces_equipment_id`, copiando las
autorizaciones `installed` como `pending_install` en el nuevo. El cierre del
viejo lo hace el trigger de `dead`.

### Máquina de estados de `key_authorizations.sync_state`

```
                pending_install ──► installed ──► pending_removal ──► removed
                       │
                       └──────────────────────────────────────────► removed
                                (install cancelled before happening)
```

Toda otra transición es rechazada.

### Ciclo de una solicitud de llave (`sales`)

Flujo modelado:

```
solicitud entra por WhatsApp
  │
  ▼
requester_type='administration' ──► authorized  (self-auth)
requester_type='individual'    ──► pending_authorization ──► authorized ──► rejected
                                                                │              (con motivo)
                                                                ▼
                                                          in_production
                                                                │
                                                                ▼
                                                          ready_for_pickup
                                                                │
                                                                ▼
                                                            delivered
```

- **`pending_authorization`**: solo aplica a solicitudes de particular. Vitalock
  contacta a la administración para confirmar.
- **`authorized`**: la admin dijo que sí (o la propia admin pidió). Aquí se
  fijan los datos del retirador (nombre + apellido + DNI) — **inmutables desde
  este punto**. Esa es la garantía de seguridad.
- Las transiciones a **`in_production`**, **`ready_for_pickup`** y
  **`delivered`** son **automáticas** vía triggers sobre `rfid_keys`:
  produzco una llave → `in_production`; produzco todas → `ready_for_pickup`;
  todas retiradas → `delivered`.
- **`cancelled`** y **`rejected`** son manuales, con motivo.

**Validaciones adicionales** (via triggers, todas hard-fail):

- Solicitante `individual` requiere name + surname + DNI + contact.
- `pickup_person` completo antes de pasar a `authorized`.
- La unidad de cada línea debe pertenecer a la administración del pedido.
- No se pueden producir más llaves que la `quantity` de la línea.
- No se puede producir para una solicitud que no esté `authorized` o `in_production`.
- El DNI en el retiro debe coincidir con el `pickup_person_dni` autorizado
  — si no matchea, la actualización se rechaza.
- Datos de retiro (`picked_up_by_*`, `delivered_by_staff_id`) inmutables una
  vez seteado `picked_up_at`.

### Auto-revocación al perder una llave

Cuando `rfid_keys.status` pasa de `active` a `lost` o `disabled`, un trigger
`AFTER UPDATE` invoca `operations.revoke_key_from_all_equipment(...)`
automáticamente, generando la worklist de borrado para el instalador. No hace
falta que la app se acuerde.

### Decisiones de `ON DELETE`

Todas las FK usan `ON DELETE RESTRICT`. Motivo: sistema de control de acceso
con trazabilidad legal — perder por cascada una administración, un edificio o
una llave no es aceptable. Las bajas son **lógicas** vía columnas de estado.

Excepciones:
- `staff.auth_user_id → auth.users` es `ON DELETE SET NULL` (la fila de auth
  puede desaparecer sin que dejemos de conocer al empleado).
- `key_authorizations.{installed,removed}_by_staff_id → staff.id` es
  `ON DELETE SET NULL` (borrar staff no debería borrar historia de trabajo).

### Enums vs `CHECK`

Se usa `CHECK` sobre columnas `text` en vez de `ENUM` nativo — más fácil de
evolucionar sin `ALTER TYPE`.

### RLS

RLS **con policies reales por rol** en las 9 tablas. Modelo actual: solo
staff de Vitalock se loguea.

- `admin` → full access (`identity.is_admin()`).
- `installer` → SELECT en el mundo operativo (edificios, unidades, llaves,
  equipos, staff). UPDATE limitado a `sync_state` + auditoría en
  `key_authorizations`. En `support.tickets` solo ve los asignados a él y
  solo puede tocar `status`/`resolution_notes`/`notes` (no puede reasignar
  ni cancelar). **Sin acceso a `sales.*`.**

Helpers en `identity` (todos `SECURITY DEFINER`):
`current_staff_id()`, `current_staff_role()`, `is_admin()`, `is_installer()`.

El rol `anon` **no tiene acceso** a los schemas `identity`, `operations`,
`sales` ni `support` (defense in depth).

Cuando aparezcan usuarios de administración o particulares, hay que
extender: nuevas tablas de linkage + nuevas policies. La estructura actual
no bloquea pero exige diseño explícito.

## Estructura

```
supabase/
├── config.toml
├── migrations/
│   ├── 20260806000001_init_extensions_and_updated_at.sql
│   ├── 20260806000002_core_tables.sql
│   ├── 20260806000003_rfid_keys.sql
│   ├── 20260806000004_rls_placeholder.sql
│   ├── 20260806000005_identity_staff.sql
│   ├── 20260806000006_operations_equipment.sql
│   ├── 20260806000007_operations_key_authorizations.sql
│   ├── 20260806000008_operations_functions.sql
│   ├── 20260806000009_rls_identity_operations_placeholder.sql
│   ├── 20260807000010_admin_units_refactor_and_fixes.sql
│   ├── 20260807000011_sales_key_requests.sql
│   ├── 20260807000012_sales_billing.sql
│   ├── 20260808000013_auth_helpers.sql
│   ├── 20260808000014_support_tickets.sql
│   ├── 20260808000015_rls_real_policies.sql
│   ├── 20260808000016_pg_cron_recurring_charges.sql
│   └── 20260808000017_audit_fixes_and_documentation.sql
├── seed.sql
└── README.md
```

## Correr localmente

Requiere Docker corriendo.

```bash
supabase start          # levanta Postgres + servicios locales
supabase db reset       # aplica migraciones y carga seed.sql
supabase db diff        # esperado: sin cambios
```

Studio local: http://localhost:54323

## Queries de humo

Todas estas deberían **fallar** con el error indicado:

```sql
-- 1) Dos unidades administrativas en el mismo edificio.
insert into public.units (building_id, number, is_administrative)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', '00-B', true);
-- unique_violation: units_one_admin_per_building_idx

-- 2) Autorizar una llave en un equipo de OTRO edificio.
insert into operations.key_authorizations (rfid_key_id, equipment_id)
values (
  (select id from public.rfid_keys where rfid_code = 'RFID-CB-101-001'),
  'f0000000-0000-0000-0000-000000000001'  -- equipo de Torre Callao
);
-- key and equipment must belong to the same building

-- 3) Resucitar un equipo muerto.
update operations.equipment set status = 'active'
where serial_number = 'SN-TC-SERVICE-OLD';
-- equipment.status transitions out of dead are forbidden

-- 4) Modificar installed_at.
update operations.equipment set installed_at = now()
where serial_number = 'SN-TC-PEATONAL-01';
-- operations.equipment.installed_at is immutable

-- 5) Autorizar una llave lost o disabled.
insert into operations.key_authorizations (rfid_key_id, equipment_id)
values (
  (select id from public.rfid_keys where rfid_code = 'RFID-TC-101-003'),  -- lost
  'f0000000-0000-0000-0000-000000000001'
);
-- cannot authorize an rfid_key with status=lost

-- 6) Transición inválida de sync_state.
update operations.key_authorizations set sync_state = 'removed'
where id = (select id from operations.key_authorizations where sync_state = 'installed' limit 1);
-- invalid sync_state transition: installed -> removed
```

Y estas deberían **funcionar**:

```sql
-- Marcar una llave como perdida: sus autorizaciones installed pasan
-- automaticamente a pending_removal (worklist para el instalador).
update public.rfid_keys set status = 'lost' where rfid_code = 'RFID-TC-101-001';
select equipment_id, sync_state, remove_reason
from operations.key_authorizations ka
where rfid_key_id = (select id from public.rfid_keys where rfid_code = 'RFID-TC-101-001');
-- todas las que estaban installed ahora en pending_removal

-- Matar un equipo (fuera de replace_equipment): cierra las autorizaciones solas.
update operations.equipment set status = 'dead', decommission_reason = 'Prueba manual'
where serial_number = 'SN-CB-PEATONAL-01';
select sync_state, count(*)
from operations.key_authorizations
where equipment_id = 'f0000000-0000-0000-0000-000000000006'
group by sync_state;
-- todo debe estar en 'removed'

-- Reemplazo end-to-end.
select operations.replace_equipment(
  'f0000000-0000-0000-0000-000000000002',   -- vieja cochera
  'SN-TC-COCHERA-02',
  'ACX-500',
  'Controladora porton cochera (reemplazo)',
  'cochera'
);
-- vieja: status=dead, autorizaciones cerradas
-- nueva: status=active, autorizaciones installed del viejo migradas
--        como pending_install
```
