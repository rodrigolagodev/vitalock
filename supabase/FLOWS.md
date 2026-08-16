# Vitalock DB — Specification for App Development

Especificación completa de la base de datos Vitalock, escrita para consumo
por agentes SDD (Spec-Driven Development) y developers construyendo apps
sobre esta DB.

**Estado**: DB terminada y auditada. Lo que sigue es capa de aplicación.

**Última revisión**: 2026-08-08. Cross-checkeada contra el schema real.

---

## Índice

1. [Cómo usar este documento](#1-cómo-usar-este-documento)
2. [Convenciones del proyecto](#2-convenciones-del-proyecto)
3. [Arquitectura de integración](#3-arquitectura-de-integración)
4. [Autenticación y autorización](#4-autenticación-y-autorización)
5. [Modelo de dominio](#5-modelo-de-dominio)
6. [Capacidades por dominio](#6-capacidades-por-dominio)
7. [Matriz de permisos por rol](#7-matriz-de-permisos-por-rol)
8. [Referencia de enums](#8-referencia-de-enums)
9. [Referencia de schema](#9-referencia-de-schema)
10. [Funciones y vistas públicas](#10-funciones-y-vistas-públicas)
11. [Flujos de negocio](#11-flujos-de-negocio)
12. [Garantías automáticas de la DB (invariantes)](#12-garantías-automáticas-de-la-db-invariantes)
13. [Catálogo de errores](#13-catálogo-de-errores)
14. [Fuera de scope (por diseño)](#14-fuera-de-scope-por-diseño)
15. [Roadmap](#15-roadmap)
16. [Desarrollo local y testing](#16-desarrollo-local-y-testing)
17. [Referencia de sample data (seed)](#17-referencia-de-sample-data-seed)

---

## 1. Cómo usar este documento

Este archivo es la **fuente de verdad funcional** de la DB. Si algo acá
contradice al schema real, gana el schema — reportar la discrepancia como
bug de documentación.

**Para agentes**:
- Secciones 2, 3, 4 son contexto obligatorio antes de escribir cualquier código.
- Sección 7 (permisos) y sección 12 (invariantes) son restricciones duras
  que el código de app **no puede violar**; están enforceadas por la DB.
- Sección 8 (enums), 9 (schema), 10 (funciones/vistas) son referencia de
  lookup — no leer completo, consultar cuando corresponda.
- Sección 11 (flujos) es el catálogo de casos de uso. Cada flujo tiene
  formato uniforme (Actor / Precondiciones / Input / Steps / Postcondiciones
  / Errores posibles / Implicancias UI) para poder derivar UI y APIs.
- Sección 13 (errores) mapea SQLSTATE + mensajes de la DB a lo que la app
  debería mostrar al usuario.

**Complementos**:
- [`README.md`](./README.md): estructura de migraciones, cómo correr el stack.
- Comentarios inline: cada tabla y función tiene `COMMENT ON` con
  descripción canónica (`SELECT obj_description(oid, 'pg_class')`).

---

## 2. Convenciones del proyecto

**Identifiers**: SQL en `snake_case`, tablas en plural (`administrations`,
`bills`), columnas en singular (`administration_id`, `total_amount`).
Convención estándar Postgres.

**Idioma**:
- Identifiers de DB, código de app, valores de enum, y este spec **en inglés**.
- Descripciones en `notes`, mensajes UI, y contenido cara al usuario **en español** (usuarios finales son Vitalock y sus clientes argentinos).
- Comentarios inline en migraciones: mixto (permitido).

**Fechas y timestamps**:
- Timestamps con timezone (`timestamptz`), **siempre**. Nunca `timestamp` naive.
- La DB los guarda en UTC; la app es responsable de convertir a la timezone del usuario (asumir `America/Argentina/Buenos_Aires` como default).
- Fechas sin hora (`date`) para cosas que son "el día tal" (charge_date, payment_date).

**Moneda**: solo pesos argentinos (`ARS`). La columna `currency` existe con
`CHECK (currency = 'ARS')`. Todos los montos son `numeric(14, 2)`.

**UUIDs**: todas las PKs son `uuid` generadas con `gen_random_uuid()`. La
app **no debe** asumir UUIDs deterministas — dejar que la DB los genere.
Excepción: los smoke tests y el seed usan UUIDs fijos para reproducibilidad.

**Naming de identifiers humanos**: números correlativos con formato
`PREFIJO-YYYY-NNNNNN`:
- `REQ-2026-000001` — key_requests
- `PRE-2026-000001` — quotes (presupuestos)
- `VNT-2026-000001` — bills (ventas)
- `SOP-2026-000001` — tickets (soporte)

La app **no debe** generarlos manualmente — los defaults del schema los
autogeneran vía sequences (`sales.quote_number_seq`, etc.).

**Auditoría**: toda tabla tiene `created_at` y `updated_at` (`timestamptz`),
con trigger que autoactualiza `updated_at`. La app no necesita setearlos.
Excepción: `support.ticket_comments` es append-only (sin `updated_at`).

**Baja lógica**: nunca `DELETE` — usar columnas de `status` (typical values:
`inactive`, `cancelled`, `dead`, `disabled`, `removed`) según la tabla. Las
FKs son `ON DELETE RESTRICT` por defecto justamente para evitar borrados
por error.

---

## 3. Arquitectura de integración

### 3.1 Stack recomendado

Supabase = Postgres + PostgREST + Auth + Realtime + Storage + Edge Functions.

**Para esta app, el flujo esperado es**:

```
┌────────────────────┐        ┌──────────────────────┐        ┌─────────────┐
│  Frontend          │  JWT   │  Supabase gateway    │        │  Postgres   │
│  (React/Vue/etc.)  ├───────►│  (PostgREST +        │  SQL   │  (nuestra   │
│  con supabase-js   │        │   GoTrue auth)       ├───────►│   DB con    │
└────────────────────┘        └──────────────────────┘        │   RLS)      │
                                                              └─────────────┘
                                                                     ▲
┌────────────────────┐                                               │
│  Backend interno   │  service_role key                             │
│  (Node/Deno/etc.)  ├─────────────────────────────────────────────►
│  (bot WA, cron,    │  (bypasea RLS para operaciones internas)
│   jobs, imports)   │
└────────────────────┘
```

**Reglas de arquitectura**:

- **Frontend directo a Supabase**: usar `supabase-js` desde la app, autenticado con el JWT del usuario. La DB filtra automáticamente vía RLS lo que puede ver/hacer.
- **Backend con service_role**: usar solo para operaciones que necesitan bypassear RLS (import batch, bot de WhatsApp registrando pedidos, cron jobs, integraciones). **NUNCA exponer la service_role key al frontend**.
- **PostgREST auto-generado**: cada tabla es accesible via REST en `/rest/v1/<schema>/<table>`. Se filtra automáticamente por RLS. Es la forma recomendada de leer/escribir simple.
- **RPC**: las funciones marcadas para consumo público (ver sección 10) se exponen via `/rest/v1/rpc/<function>`. Usar para operaciones complejas o multi-tabla.

### 3.2 Schemas expuestos en la API

Solo estos schemas se exponen via PostgREST:
- `public`, `identity`, `operations`, `sales`, `support`
- (Configurado en `supabase/config.toml`, línea `[api].schemas`.)

Los schemas `auth`, `storage`, `cron`, etc. son internos de Supabase — la
app no debería tocarlos directamente.

### 3.3 Realtime

Postgres publica cambios vía `logical replication` a Supabase Realtime. Para
funcionalidades tipo "el instalador ve la worklist actualizarse en tiempo real
cuando el admin agrega una autorización nueva":

```js
supabase
  .channel('installer-worklist')
  .on('postgres_changes', {
    event: '*',
    schema: 'operations',
    table: 'key_authorizations',
    filter: `sync_state=in.(pending_install,pending_removal)`,
  }, handler)
  .subscribe();
```

RLS aplica también a los eventos realtime — el installer solo recibe eventos
de rows que puede ver.

### 3.4 Storage

Hoy no usamos Supabase Storage. Si en el futuro hay que subir fotos (por
ejemplo del instalador documentando el trabajo), se agrega un bucket dedicado.

---

## 4. Autenticación y autorización

### 4.1 Modelo de auth

Solo usuarios internos de Vitalock se loguean. Dos roles:
- `admin` — full access.
- `installer` — acceso operativo limitado.

Los clientes (administraciones) y usuarios finales (particulares) **no se
loguean**. Interactúan por WhatsApp / teléfono / mail, y staff carga sus
datos en el sistema.

### 4.2 Flujo de onboarding de un usuario

**Vitalock no expone signup público**. Los usuarios se provisionan por un admin:

1. Admin de Vitalock invita al nuevo usuario via Supabase Auth API o dashboard:
   ```js
   await supabase.auth.admin.createUser({
     email: 'nuevo@vitalock.com',
     password: '...',
     email_confirm: true,
   });
   ```
2. Retorna un `user.id` (UUID de `auth.users`).
3. Admin lo linkea a un row de `identity.staff`:
   ```sql
   insert into identity.staff (auth_user_id, full_name, email, role, status)
   values ('<user.id>', 'Nombre completo', 'nuevo@vitalock.com', 'installer', 'active');
   ```
   O si el row de staff ya existe (pre-provisioning):
   ```sql
   update identity.staff set auth_user_id = '<user.id>' where email = 'nuevo@vitalock.com';
   ```

**Alternativa (self-service con invitación email)**: si Vitalock configura Supabase Auth con "magic link" o "invite email", el usuario recibe un email con un link que le pide setear password. Vale la pena para el caso staff pero requiere configuración extra en la app.

### 4.3 Login desde la app

```js
const { data, error } = await supabase.auth.signInWithPassword({
  email, password
});
// data.session.access_token es el JWT que se manda en cada request.
// supabase-js lo persiste automáticamente en localStorage y lo adjunta.
```

### 4.4 Cómo la app detecta el rol del usuario

**Server-side (recomendado)**: la DB tiene helpers:
```sql
select identity.current_staff_role();  -- 'admin' | 'installer' | null
select identity.is_admin();             -- boolean
select identity.is_installer();         -- boolean
```

Se pueden invocar desde la app vía RPC:
```js
const { data } = await supabase.rpc('current_staff_role');
// data === 'admin' | 'installer' | null
```

**Client-side (para pre-render inicial)**: hacer un query directo al primer render:
```js
const { data: staff } = await supabase
  .from('staff')
  .select('id, role, full_name, status')
  .eq('auth_user_id', supabase.auth.getUser().id)
  .single();
```

El schema `identity` debe estar expuesto en `config.toml` para que este query funcione desde `supabase-js`.

### 4.5 Casos borde de auth

**Usuario autenticado sin row en `identity.staff`**: el JWT es válido pero
`current_staff_role()` retorna `null`. Todas las policies RLS que requieren
`is_admin()` / `is_installer()` fallan → 0 rows en cualquier query. La app
debe detectar esto en el primer request y mostrar un error tipo "cuenta no
provisionada, contactar a soporte".

**Usuario con staff en `status = 'inactive'`**: `is_admin()` / `is_installer()`
retornan `false` (filtran por `status='active'`). Similar al caso anterior —
el usuario queda "logueado pero sin acceso". Manejarlo con logout automático
o mensaje explícito.

**Usuario borrado de `auth.users`**: la FK de `identity.staff.auth_user_id`
es `ON DELETE SET NULL`, así que el staff row queda pero pierde el linkage.
El usuario no puede volver a loguearse hasta que un admin lo re-linkee.

### 4.6 Logout

```js
await supabase.auth.signOut();
```

Limpia el JWT del cliente. La sesión sigue "válida" server-side hasta su
expiración natural (Supabase Auth default: 1h para access token). Para
invalidar todas las sesiones de un usuario (por ejemplo, si sospecha
compromiso), un admin debe usar el Admin API para forzar el signOut de esa
cuenta.

---

## 5. Modelo de dominio

### 5.1 Diagrama de entidades

```mermaid
erDiagram
  ADMINISTRATIONS ||--o{ BUILDINGS   : owns
  BUILDINGS       ||--o{ UNITS       : contains
  UNITS           ||--o{ RFID_KEYS   : issues
  BUILDINGS       ||--o{ EQUIPMENT   : hosts
  EQUIPMENT       ||--o{ KEY_AUTHORIZATIONS : "loaded with"
  RFID_KEYS       ||--o{ KEY_AUTHORIZATIONS : "authorized on"
  EQUIPMENT       ||--o| EQUIPMENT   : "replaces (dead)"

  ADMINISTRATIONS ||--o{ KEY_REQUESTS       : "requests keys"
  KEY_REQUESTS    ||--o{ KEY_REQUEST_ITEMS  : has
  KEY_REQUEST_ITEMS ||--o{ RFID_KEYS        : produces

  ADMINISTRATIONS ||--o{ QUOTES             : "receives"
  QUOTES          ||--o{ QUOTE_ITEMS        : has
  ADMINISTRATIONS ||--o{ BILLS              : "is charged"
  QUOTES          ||--o| BILLS              : "becomes"
  BILLS           ||--o{ BILL_ITEMS         : has
  BILLS           ||--|| PAYMENTS           : "receives one"
  ADMINISTRATIONS ||--o{ RECURRING_CHARGES  : "subscribes to"
  RECURRING_CHARGES ||--o{ BILL_ITEMS       : "generates"
  PRODUCTS        ||--o{ BILL_ITEMS         : "referenced by"
  PRODUCTS        ||--o{ QUOTE_ITEMS        : "referenced by"

  ADMINISTRATIONS ||--o{ TICKETS            : "opens"
  BUILDINGS       ||--o{ TICKETS            : "affects"
  EQUIPMENT       ||--o| TICKETS            : "affects (optional)"
  TICKETS         ||--o{ TICKET_COMMENTS    : has

  STAFF           ||--o{ TICKETS            : "opened_by / assigned_to / resolved_by"
```

### 5.2 Los 5 schemas

| Schema        | Propósito                                                | Tablas |
|---------------|----------------------------------------------------------|--------|
| `public`      | Customer service — cliente, edificios, unidades, llaves. | 4 |
| `identity`    | Staff interno de Vitalock.                               | 1 |
| `operations`  | Equipos físicos y autorizaciones llave↔equipo.           | 2 |
| `sales`       | Solicitudes, presupuestos, cargos, cobros, abonos.       | 9 |
| `support`     | Tickets de mantenimiento e instalación.                  | 2 |

Total: **18 tablas** en la DB.

---

## 6. Capacidades por dominio

### 6.1 Gestión de clientes (`public`)

- Registrar `administrations` (el ente que factura; único tipo de cliente).
- Registrar `buildings` por administración.
- Registrar `units` por edificio: departamentos, locales, cocheras, y **una** unidad marcada `is_administrative=true` para llaves administrativas.
- Baja lógica de todo (nunca borrado físico — trazabilidad legal).
- Consulta jerárquica desde cualquier punto: `key → unit → building → administration`.

### 6.2 Gestión de llaves RFID (`public.rfid_keys`)

- Emitir llaves físicas atadas permanentemente a una unidad (`unit_id` inmutable).
- Llaves administrativas viven en la unidad con `is_administrative=true`; el rol específico (portero, mantenimiento) va como texto libre en `notes`.
- Ciclo: `active → disabled | lost`.
- Al marcar como perdida/desactivada, **auto-genera worklist de revocación** en todos los equipos donde esté cargada.

### 6.3 Equipos (`operations.equipment`)

- Registrar controladoras por edificio (serial único global; una controladora = una puerta).
- Ciclo: `active ↔ maintenance → dead` (`dead` es terminal).
- Reemplazo atómico via `operations.replace_equipment(...)` (ver sección 10).
- Al pasar a `dead` (fuera del reemplazo), **auto-cierra sus autorizaciones**.
- Trazabilidad completa vía `replaces_equipment_id`.

### 6.4 Autorizaciones (`operations.key_authorizations`)

- Modelo N:M: una llave puede estar cargada en varios equipos del **mismo edificio**; un equipo carga muchas llaves.
- Sync state modela el workflow del instalador: `pending_install → installed → pending_removal → removed`.
- Worklist del instalador: filtrar por `sync_state IN ('pending_install','pending_removal')` (índice parcial optimizado).

### 6.5 Staff (`identity.staff`)

- Empleados internos de Vitalock, roles `admin` | `installer`.
- Vinculables a `auth.users` para login (ver sección 4).

### 6.6 Solicitudes de llaves (`sales.key_requests`)

- Pedidos entrantes vía WhatsApp / mail / teléfono.
- `requester_type = 'administration'` → auto-autorizado. `'individual'` → requiere confirmación de la admin.
- Header + líneas: un pedido puede pedir N llaves para M unidades (distintos edificios posible).
- Datos del retirador (nombre + apellido + DNI) **inmutables desde `authorized`**.
- Retiro con verificación de DNI enforceada por la DB.
- Estado auto-avanza via triggers sobre `rfid_keys`.

### 6.7 Tickets de soporte (`support.tickets`)

- Categorías: `maintenance` | `installation`.
- Alcance siempre a admin + edificio; opcional a unit / equipment.
- Trazabilidad opcional a `bill` (si se cobra) y `key_request` (si generó pedido).
- Estados: `open → in_progress → resolved`, con reapertura y `cancelled`.
- Auto-transición del equipo a `maintenance` si el ticket tiene `equipment_id` + `category='maintenance'` y pasa a `in_progress`.
- Comments append-only.

### 6.8 Facturación interna (`sales.*`)

**Vitalock no emite facturas AFIP**; la contadora lo hace externamente
consumiendo `sales.pending_to_invoice`. Nosotros trackeamos:

- **Products** (`sales.products`): catálogo tipológico sin precio fijo.
- **Quotes** (`sales.quotes` + `quote_items`): presupuestos formales.
- **Bills** (`sales.bills` + `bill_items`): cargos a administraciones.
- **Payments** (`sales.payments`): un pago por bill, monto exacto.
- **Recurring charges** (`sales.recurring_charges`): abonos mensuales generados via función helper.
- **Vistas**: `sales.pending_to_invoice`, `sales.administration_balance`.

---

## 7. Matriz de permisos por rol

### 7.1 Reglas globales

- `admin` (staff Vitalock, activo): **acceso total** a todos los schemas y operaciones.
- `installer` (staff Vitalock, activo): acceso operativo limitado (ver matriz).
- `anon` (no autenticado): **sin acceso** a los schemas `identity`, `operations`, `sales`, `support`.
- `service_role` (backend interno con secret): **bypasea RLS**. Usar solo desde backend.

### 7.2 Matriz por tabla

Notación:
- ✅ = permitido
- ❌ = denegado (RLS filtra a 0 rows en SELECT; INSERT/UPDATE/DELETE fallan con `insufficient_privilege`)
- 🔒 = permitido pero con column-level restrictions (ver notas)
- 🎯 = permitido pero row-level restringido (ver notas)

| Schema.Tabla                         | admin | installer   | Notas                                                                                                    |
|--------------------------------------|:-----:|:-----------:|----------------------------------------------------------------------------------------------------------|
| `public.administrations`             | ✅ ALL | SELECT     | Installer necesita el nombre para contexto (mostrar "Torre Callao — Admin Central" en su UI).            |
| `public.buildings`                   | ✅ ALL | SELECT     | Idem.                                                                                                     |
| `public.units`                       | ✅ ALL | SELECT     | Idem.                                                                                                     |
| `public.rfid_keys`                   | ✅ ALL | SELECT     | Installer ve códigos RFID para cargar en equipos, pero no puede modificar (los produce el admin).       |
| `identity.staff`                     | ✅ ALL | SELECT     | Installer ve colegas (para saber quién es assigned_to de un ticket, etc.).                                |
| `operations.equipment`               | ✅ ALL | SELECT     | Installer ve equipos para saber dónde ir; no crea ni modifica (admin decide alta/baja).                   |
| `operations.key_authorizations`      | ✅ ALL | SELECT + 🔒 UPDATE | Installer solo puede modificar: `sync_state`, `installed_at`, `installed_by_staff_id`, `removed_at`, `removed_by_staff_id`, `remove_reason`, `notes`. FKs (rfid_key_id, equipment_id) son inmutables por trigger. |
| `sales.products`                     | ✅ ALL | ❌          |                                                                                                          |
| `sales.quotes`, `quote_items`        | ✅ ALL | ❌          |                                                                                                          |
| `sales.bills`, `bill_items`          | ✅ ALL | ❌          |                                                                                                          |
| `sales.payments`                     | ✅ ALL | ❌          |                                                                                                          |
| `sales.recurring_charges`            | ✅ ALL | ❌          |                                                                                                          |
| `sales.key_requests`, `_items`       | ✅ ALL | ❌          |                                                                                                          |
| `sales.pending_to_invoice` (view)    | ✅     | ❌          | View con `security_invoker=true`; installer que hace SELECT recibe 0 rows.                                |
| `sales.administration_balance` (view)| ✅     | ⚠️         | Installer ve la lista de admins con `total_billed`, `total_paid`, `balance` en 0 (RLS filtra los sales.* subyacentes). No hay leak de montos, solo lista de nombres que ya podía ver.  |
| `support.tickets`                    | ✅ ALL | 🎯 SELECT + 🎯🔒 UPDATE | Installer solo ve tickets donde `assigned_to_staff_id = identity.current_staff_id()`. UPDATE solo puede tocar: `status`, `resolution_notes`, `resolved_by_staff_id`, `notes`. No puede reasignar ni cancelar. |
| `support.ticket_comments`            | ✅ ALL | 🎯 SELECT + 🎯 INSERT | Installer solo ve comments de sus tickets asignados. INSERT solo permitido con `author_staff_id = current_staff_id()` (previene impersonación). Los comments son append-only (no UPDATE, no DELETE — para nadie). |

### 7.3 RLS testing en local

Ver sección 16.2 para cómo simular un rol específico en `psql`.

---

## 8. Referencia de enums

Toda columna con valores acotados está enforceada por `CHECK` constraint.
La app **debe** validar contra estos valores antes de submit (para UX), pero
la DB es la fuente de verdad.

### 8.1 Estados de entidades

| Tabla | Columna | Valores permitidos | Notas |
|---|---|---|---|
| `administrations` | `status` | `active`, `inactive` | Baja lógica de admin. |
| `buildings` | `status` | `active`, `inactive` | Idem. |
| `units` | `status` | `active`, `inactive` | Idem. |
| `staff` | `status` | `active`, `inactive` | `inactive` bloquea acceso via `is_admin()`/`is_installer()`. |
| `rfid_keys` | `status` | `active`, `disabled`, `lost` | Auto-completa `deactivated_at`. Auto-revoca autorizaciones. |
| `equipment` | `status` | `active`, `maintenance`, `dead` | `dead` es terminal. Auto-cierra autorizaciones. |
| `equipment` | `access_type` | `peatonal`, `cochera`, `service`, `terraza`, `amenities`, `other` | Categorización flexible. Nullable. |
| `key_authorizations` | `sync_state` | `pending_install`, `installed`, `pending_removal`, `removed` | Máquina de estados forward-only. |
| `key_requests` | `status` | `pending_authorization`, `authorized`, `in_production`, `ready_for_pickup`, `delivered`, `rejected`, `cancelled` | Auto-avanza vía triggers. Terminales: `delivered`, `rejected`, `cancelled`. |
| `quotes` | `status` | `draft`, `sent`, `accepted`, `rejected`, `expired`, `cancelled` | Terminales: `accepted`, `rejected`, `expired`, `cancelled`. |
| `bills` | `status` | `draft`, `confirmed`, `cancelled` | `cancelled` es terminal. No se puede cancelar si tiene payment. |
| `tickets` | `status` | `open`, `in_progress`, `resolved`, `cancelled` | Permite reapertura `resolved → in_progress`. |

### 8.2 Tipologías y categorías

| Tabla | Columna | Valores | Uso |
|---|---|---|---|
| `staff` | `role` | `admin`, `installer` | Solo 2 roles internos. |
| `products` | `product_type` | `rfid_key`, `equipment`, `installation`, `maintenance_recurring`, `maintenance_one_time`, `equipment_replacement`, `cctv_wifi_installation`, `other` | Catálogo tipológico. |
| `key_requests` | `requester_type` | `administration`, `individual` | Define si auto-autoriza o requiere confirmación. |
| `key_requests` | `authorization_method` | `whatsapp`, `email`, `phone`, `in_person`, `self` | Canal por el que se confirmó la autorización. `self` = auto-autorización de admin. |
| `key_requests` | `rejection_reason` | `not_authorized_by_administration`, `data_mismatch`, `security_concern`, `other` | Categoría de rechazo (con `rejection_notes` free text opcional). |
| `payments` | `payment_method` | `cash`, `transfer`, `deposit`, `mercado_pago`, `check`, `other` | Autodetermina `requires_invoice` (todo salvo `cash` requiere). |
| `tickets` | `category` | `maintenance`, `installation` | Categoría del ticket. |

### 8.3 Otros valores acotados

| Tabla | Columna | Valores | Notas |
|---|---|---|---|
| `quotes`, `bills`, `payments` | `currency` | `ARS` (solo) | Enforceado por CHECK; futura extensión requiere migración. |

---

## 9. Referencia de schema

Resumen columna-por-columna. Ver `\d+ <table>` en `psql` para tipos exactos
y defaults, y `SELECT obj_description(...)` para los comments detallados.

### 9.1 `public.administrations`

Ente comercial que factura. Único tipo de "cliente".

| Columna | Tipo | Null | Default | Notas |
|---|---|---|---|---|
| `id` | uuid | ❌ | gen_random_uuid() | PK |
| `company_name` | text | ❌ | | Razón social |
| `tax_id` | text | ✅ | | CUIT, único |
| `email` | text | ✅ | | |
| `phone` | text | ✅ | | |
| `address` | text | ✅ | | |
| `status` | text | ❌ | `'active'` | Enum |
| `notes` | text | ✅ | | Free text |
| `created_at`, `updated_at` | timestamptz | ❌ | now() | Auditoría |

### 9.2 `public.buildings`

Edificio de una administración.

| Columna | Tipo | Null | Default | Notas |
|---|---|---|---|---|
| `id` | uuid | ❌ | gen_random_uuid() | PK |
| `administration_id` | uuid | ❌ | | FK RESTRICT |
| `name` | text | ❌ | | |
| `address` | text | ✅ | | |
| `city` | text | ✅ | | |
| `status` | text | ❌ | `'active'` | Enum |
| `notes` | text | ✅ | | |
| `created_at`, `updated_at` | timestamptz | ❌ | now() | |

### 9.3 `public.units`

Unidad dentro de un edificio (dept, local, cochera, admin slot).

| Columna | Tipo | Null | Default | Notas |
|---|---|---|---|---|
| `id` | uuid | ❌ | gen_random_uuid() | PK |
| `building_id` | uuid | ❌ | | FK RESTRICT |
| `number` | text | ❌ | | Único por edificio |
| `unit_type` | text | ✅ | | Free text (departamento, local, cochera, ...) |
| `is_administrative` | bool | ❌ | `false` | Máx 1 por building (unique parcial) |
| `status` | text | ❌ | `'active'` | Enum |
| `notes` | text | ✅ | | |
| `created_at`, `updated_at` | timestamptz | ❌ | now() | |

**Constraints únicos**: `(building_id, number)`; `(building_id) WHERE is_administrative=true`.

### 9.4 `public.rfid_keys`

Tarjeta RFID física emitida por Vitalock.

| Columna | Tipo | Null | Default | Notas |
|---|---|---|---|---|
| `id` | uuid | ❌ | gen_random_uuid() | PK |
| `rfid_code` | text | ❌ | | Único global |
| `unit_id` | uuid | ❌ | | FK RESTRICT, **inmutable** |
| `status` | text | ❌ | `'active'` | Enum; auto-revoca autorizaciones en lost/disabled |
| `notes` | text | ✅ | | Free text (nombre comprador, rol admin, etc.) |
| `activated_at` | timestamptz | ❌ | now() | |
| `deactivated_at` | timestamptz | ✅ | | Auto-fill al pasar a disabled/lost |
| `key_request_item_id` | uuid | ✅ | | FK opcional, **inmutable** |
| `picked_up_at` | timestamptz | ✅ | | |
| `picked_up_by_name` | text | ✅ | | Requerido si picked_up_at set |
| `picked_up_by_surname` | text | ✅ | | Idem |
| `picked_up_by_dni` | text | ✅ | | Idem, debe matchear DNI autorizado |
| `delivered_by_staff_id` | uuid | ✅ | | FK SET NULL |
| `created_at`, `updated_at` | timestamptz | ❌ | now() | |

**Inmutabilidad post-pickup**: `picked_up_*` y `delivered_by_staff_id` son inmutables una vez seteado `picked_up_at`.

### 9.5 `identity.staff`

Empleado interno de Vitalock.

| Columna | Tipo | Null | Default | Notas |
|---|---|---|---|---|
| `id` | uuid | ❌ | gen_random_uuid() | PK |
| `auth_user_id` | uuid | ✅ | | FK a auth.users, SET NULL, único |
| `full_name` | text | ❌ | | |
| `email` | text | ✅ | | Único |
| `phone` | text | ✅ | | |
| `role` | text | ❌ | | Enum (`admin` | `installer`) |
| `status` | text | ❌ | `'active'` | Enum |
| `notes` | text | ✅ | | |
| `created_at`, `updated_at` | timestamptz | ❌ | now() | |

### 9.6 `operations.equipment`

Controladora física (una = una puerta).

| Columna | Tipo | Null | Default | Notas |
|---|---|---|---|---|
| `id` | uuid | ❌ | gen_random_uuid() | PK |
| `serial_number` | text | ❌ | | Único global, **inmutable** |
| `model` | text | ✅ | | |
| `building_id` | uuid | ❌ | | FK RESTRICT, **inmutable** |
| `description` | text | ❌ | | Ej: "Controladora porton peatonal" |
| `access_type` | text | ✅ | | Enum |
| `status` | text | ❌ | `'active'` | Enum, `dead` terminal |
| `replaces_equipment_id` | uuid | ✅ | | FK a otro equipment (mismo building, dead), **inmutable** |
| `installed_at` | timestamptz | ❌ | now() | **Inmutable** |
| `decommissioned_at` | timestamptz | ✅ | | Auto-fill al pasar a dead |
| `decommission_reason` | text | ✅ | | |
| `notes` | text | ✅ | | |
| `created_at`, `updated_at` | timestamptz | ❌ | now() | |

### 9.7 `operations.key_authorizations`

Relación N:M llave↔equipo con sync state.

| Columna | Tipo | Null | Default | Notas |
|---|---|---|---|---|
| `id` | uuid | ❌ | gen_random_uuid() | PK |
| `rfid_key_id` | uuid | ❌ | | FK RESTRICT, **inmutable** |
| `equipment_id` | uuid | ❌ | | FK RESTRICT, **inmutable** |
| `sync_state` | text | ❌ | `'pending_install'` | Enum, forward-only |
| `installed_at` | timestamptz | ✅ | | Auto-fill al pasar a installed |
| `installed_by_staff_id` | uuid | ✅ | | FK SET NULL |
| `removed_at` | timestamptz | ✅ | | Auto-fill al pasar a removed |
| `removed_by_staff_id` | uuid | ✅ | | FK SET NULL |
| `remove_reason` | text | ✅ | | |
| `notes` | text | ✅ | | |
| `created_at`, `updated_at` | timestamptz | ❌ | now() | |

**Constraint único**: `(rfid_key_id, equipment_id)`.

### 9.8 `sales.products`

Catálogo tipológico (sin precio fijo).

| Columna | Tipo | Null | Default | Notas |
|---|---|---|---|---|
| `id` | uuid | ❌ | gen_random_uuid() | PK |
| `name` | text | ❌ | | |
| `product_type` | text | ❌ | | Enum |
| `description` | text | ✅ | | |
| `is_active` | bool | ❌ | `true` | Discontinuar sin borrar |
| `created_at`, `updated_at` | timestamptz | ❌ | now() | |

Productos con `is_active=false` **no pueden ser referenciados** en nuevos items (bill_items, quote_items, recurring_charges). Referencias históricas se mantienen.

### 9.9 `sales.quotes` / `sales.quote_items`

Presupuestos + líneas.

**`quotes`**:

| Columna | Tipo | Null | Default | Notas |
|---|---|---|---|---|
| `id` | uuid | ❌ | gen_random_uuid() | PK |
| `quote_number` | text | ❌ | `PRE-YYYY-NNNNNN` auto | Único, auto-generado |
| `administration_id` | uuid | ❌ | | FK RESTRICT, **inmutable** |
| `status` | text | ❌ | `'draft'` | Enum |
| `valid_until` | date | ✅ | | |
| `total_amount` | numeric(14,2) | ❌ | `0` | **Auto-computado** desde items |
| `currency` | text | ❌ | `'ARS'` | Solo ARS |
| `sent_at`, `accepted_at`, `rejected_at` | timestamptz | ✅ | | |
| `rejection_reason` | text | ✅ | | |
| `created_by_staff_id` | uuid | ✅ | | FK SET NULL |
| `notes` | text | ✅ | | |
| `created_at`, `updated_at` | timestamptz | ❌ | now() | |

**`quote_items`**:

| Columna | Tipo | Null | Default | Notas |
|---|---|---|---|---|
| `id` | uuid | ❌ | gen_random_uuid() | PK |
| `quote_id` | uuid | ❌ | | FK CASCADE |
| `product_id` | uuid | ✅ | | FK RESTRICT (opcional) |
| `description` | text | ❌ | | |
| `quantity` | numeric(10,2) | ❌ | | > 0 |
| `unit_price` | numeric(14,2) | ❌ | | >= 0 |
| `subtotal` | numeric(14,2) | ❌ | `0` | **Auto-computado** = quantity × unit_price |
| `notes` | text | ✅ | | |
| `created_at`, `updated_at` | timestamptz | ❌ | now() | |

Items solo se pueden modificar si `quote.status = 'draft'`.

### 9.10 `sales.bills` / `sales.bill_items`

Cargos + líneas.

**`bills`**:

| Columna | Tipo | Null | Default | Notas |
|---|---|---|---|---|
| `id` | uuid | ❌ | gen_random_uuid() | PK |
| `bill_number` | text | ❌ | `VNT-YYYY-NNNNNN` auto | Único, auto-generado |
| `administration_id` | uuid | ❌ | | FK RESTRICT, **inmutable** |
| `charge_date` | date | ❌ | current_date | |
| `due_date` | date | ✅ | | |
| `status` | text | ❌ | `'draft'` | Enum |
| `total_amount` | numeric(14,2) | ❌ | `0` | **Auto-computado** |
| `currency` | text | ❌ | `'ARS'` | |
| `from_quote_id` | uuid | ✅ | | FK SET NULL, **inmutable** |
| `cancellation_reason` | text | ✅ | | Requerido si cancelled |
| `created_by_staff_id` | uuid | ✅ | | FK SET NULL |
| `notes` | text | ✅ | | |
| `created_at`, `updated_at` | timestamptz | ❌ | now() | |

**`bill_items`**:

| Columna | Tipo | Null | Default | Notas |
|---|---|---|---|---|
| `id` | uuid | ❌ | gen_random_uuid() | PK |
| `bill_id` | uuid | ❌ | | FK CASCADE |
| `product_id` | uuid | ✅ | | FK RESTRICT (opcional, debe estar active) |
| `description` | text | ❌ | | |
| `quantity` | numeric(10,2) | ❌ | | > 0 |
| `unit_price` | numeric(14,2) | ❌ | | >= 0 |
| `subtotal` | numeric(14,2) | ❌ | `0` | **Auto-computado** |
| `related_key_request_item_id` | uuid | ✅ | | FK SET NULL — trazabilidad |
| `related_equipment_id` | uuid | ✅ | | Idem |
| `related_recurring_charge_id` | uuid | ✅ | | Idem |
| `notes` | text | ✅ | | |
| `created_at`, `updated_at` | timestamptz | ❌ | now() | |

Items solo modificables si `bill.status = 'draft'`.

### 9.11 `sales.payments`

Cobros.

| Columna | Tipo | Null | Default | Notas |
|---|---|---|---|---|
| `id` | uuid | ❌ | gen_random_uuid() | PK |
| `administration_id` | uuid | ❌ | | FK RESTRICT; debe matchear bill.administration |
| `bill_id` | uuid | ❌ | | FK RESTRICT, **inmutable**, **único** (1 pago por bill) |
| `payment_date` | date | ❌ | current_date | |
| `amount` | numeric(14,2) | ❌ | | > 0; debe ser == bill.total_amount |
| `currency` | text | ❌ | `'ARS'` | |
| `payment_method` | text | ❌ | | Enum, **inmutable** |
| `reference` | text | ✅ | | Nro transferencia, comprobante |
| `requires_invoice` | bool | ❌ | | **Auto-computado** = (method != cash) |
| `invoiced_at` | timestamptz | ✅ | | Set por contadora cuando factura |
| `notes` | text | ✅ | | |
| `created_at`, `updated_at` | timestamptz | ❌ | now() | |

### 9.12 `sales.recurring_charges`

Configuración de abonos mensuales.

| Columna | Tipo | Null | Default | Notas |
|---|---|---|---|---|
| `id` | uuid | ❌ | gen_random_uuid() | PK |
| `administration_id` | uuid | ❌ | | FK RESTRICT |
| `product_id` | uuid | ✅ | | FK RESTRICT (opcional, active) |
| `description` | text | ❌ | | |
| `monthly_amount` | numeric(14,2) | ❌ | | > 0 |
| `start_date` | date | ❌ | | |
| `end_date` | date | ✅ | | >= start_date si set |
| `is_active` | bool | ❌ | `true` | Pausar sin borrar |
| `notes` | text | ✅ | | |
| `created_at`, `updated_at` | timestamptz | ❌ | now() | |

### 9.13 `sales.key_requests` / `sales.key_request_items`

Solicitudes de llaves + líneas.

**`key_requests`**:

| Columna | Tipo | Null | Default | Notas |
|---|---|---|---|---|
| `id` | uuid | ❌ | gen_random_uuid() | PK |
| `request_number` | text | ❌ | `REQ-YYYY-NNNNNN` auto | Único |
| `administration_id` | uuid | ❌ | | FK RESTRICT |
| `requester_type` | text | ❌ | | Enum |
| `requester_name` | text | ✅ | | Obligatorio siempre (chequeado por trigger) |
| `requester_surname` | text | ✅ | | Obligatorio si `individual` |
| `requester_dni` | text | ✅ | | Obligatorio si `individual` |
| `requester_contact` | text | ✅ | | Obligatorio si `individual` (WhatsApp/tel/email) |
| `pickup_person_name` | text | ✅ | | Obligatorio si status >= authorized |
| `pickup_person_surname` | text | ✅ | | Idem |
| `pickup_person_dni` | text | ✅ | | Idem, **inmutable desde authorized** |
| `status` | text | ❌ | `'pending_authorization'` | Enum, auto para admin → `'authorized'` |
| `received_at` | timestamptz | ❌ | now() | |
| `received_by_staff_id` | uuid | ✅ | | FK SET NULL |
| `authorized_by` | text | ✅ | | Nombre libre del referente de admin |
| `authorized_at` | timestamptz | ✅ | | Auto-fill al pasar a authorized (self-auth admin) |
| `authorization_method` | text | ✅ | | Enum |
| `rejection_reason` | text | ✅ | | Requerido si rejected |
| `rejection_notes` | text | ✅ | | |
| `cancellation_reason` | text | ✅ | | Requerido si cancelled |
| `notes` | text | ✅ | | |
| `created_at`, `updated_at` | timestamptz | ❌ | now() | |

**`key_request_items`**:

| Columna | Tipo | Null | Default | Notas |
|---|---|---|---|---|
| `id` | uuid | ❌ | gen_random_uuid() | PK |
| `key_request_id` | uuid | ❌ | | FK RESTRICT, **inmutable** |
| `unit_id` | uuid | ❌ | | FK RESTRICT, **inmutable**; unit debe ser de un edificio del admin del request |
| `quantity` | int | ❌ | | > 0; no reducible por debajo de las rfid_keys ya producidas |
| `notes` | text | ✅ | | |
| `created_at`, `updated_at` | timestamptz | ❌ | now() | |

### 9.14 `support.tickets` / `support.ticket_comments`

Tickets de soporte + timeline.

**`tickets`**:

| Columna | Tipo | Null | Default | Notas |
|---|---|---|---|---|
| `id` | uuid | ❌ | gen_random_uuid() | PK |
| `ticket_number` | text | ❌ | `SOP-YYYY-NNNNNN` auto | Único |
| `administration_id` | uuid | ❌ | | FK RESTRICT, **inmutable** |
| `building_id` | uuid | ❌ | | FK RESTRICT, **inmutable**, debe ∈ admin |
| `unit_id` | uuid | ✅ | | FK RESTRICT, debe ∈ building |
| `equipment_id` | uuid | ✅ | | FK RESTRICT, debe ∈ building |
| `category` | text | ❌ | | Enum, **inmutable** |
| `description` | text | ❌ | | |
| `status` | text | ❌ | `'open'` | Enum; máquina con reapertura |
| `related_bill_id` | uuid | ✅ | | FK SET NULL |
| `related_key_request_id` | uuid | ✅ | | FK SET NULL |
| `opened_at` | timestamptz | ❌ | now() | **Inmutable** |
| `opened_by_staff_id` | uuid | ✅ | | FK SET NULL, **inmutable** |
| `assigned_to_staff_id` | uuid | ✅ | | FK SET NULL; installer no puede modificar |
| `resolved_at` | timestamptz | ✅ | | Auto-fill al pasar a resolved |
| `resolved_by_staff_id` | uuid | ✅ | | FK SET NULL |
| `resolution_notes` | text | ✅ | | Requerido si resolved |
| `cancellation_reason` | text | ✅ | | Requerido si cancelled |
| `notes` | text | ✅ | | |
| `created_at`, `updated_at` | timestamptz | ❌ | now() | |

**`ticket_comments`** (append-only):

| Columna | Tipo | Null | Default | Notas |
|---|---|---|---|---|
| `id` | uuid | ❌ | gen_random_uuid() | PK |
| `ticket_id` | uuid | ❌ | | FK CASCADE (pero cascada bloqueada por trigger append-only) |
| `author_staff_id` | uuid | ✅ | | FK SET NULL; installer solo puede insertar con `= current_staff_id()` |
| `body` | text | ❌ | | |
| `created_at` | timestamptz | ❌ | now() | Sin `updated_at` — append only |

---

## 10. Funciones y vistas públicas

Callables desde la app vía Supabase RPC o consultables como views.

### 10.1 Auth helpers (`identity.*`)

Todas `SECURITY DEFINER`, `STABLE`.

| Función | Retorna | Uso |
|---|---|---|
| `identity.current_staff_id()` | uuid | UUID del staff logueado, o NULL. |
| `identity.current_staff_role()` | text | `'admin'`, `'installer'`, o NULL. |
| `identity.is_admin()` | bool | `true` si admin activo. |
| `identity.is_installer()` | bool | `true` si installer activo. |

**Desde JS**:
```js
const { data } = await supabase.rpc('current_staff_role');
```

### 10.2 Operations

| Función | Signatura | Uso |
|---|---|---|
| `operations.replace_equipment(...)` | `(p_old_equipment_id uuid, p_new_serial_number text, p_new_model text, p_new_description text, p_new_access_type text default null, p_decommission_reason text default 'Replaced by new equipment', p_replacement_staff_id uuid default null) returns uuid` | Reemplaza un equipo atómicamente. Retorna el UUID del nuevo. Ver flow 11.7. |
| `operations.revoke_key_from_all_equipment(...)` | `(p_rfid_key_id uuid, p_reason text default 'Key revoked') returns int` | Marca todas las autorizaciones installed de una llave como pending_removal. Retorna cantidad de rows afectadas. Se invoca automáticamente cuando la llave pasa a lost/disabled, pero también manual si es necesario. |

### 10.3 Sales

| Función | Signatura | Uso |
|---|---|---|
| `sales.generate_recurring_charges(p_year int, p_month int)` | `returns int` | Genera bills confirmed del mes para todos los recurring_charges activos, sin duplicar. Retorna cantidad de bills creadas. Ver flow 11.11. Hay un cron job (`pg_cron`) que lo corre el 1° de cada mes 08:00 UTC. |

### 10.4 Vistas de consumo

| Vista | Retorna | Uso |
|---|---|---|
| `sales.pending_to_invoice` | `payment_id, payment_date, amount, payment_method, reference, bill_number, charge_date, administration_id, company_name, tax_id` | Pagos por transferencia/depósito/MP/cheque no facturados aún. La contadora consume esto y va marcando `payments.invoiced_at`. |
| `sales.administration_balance` | `administration_id, company_name, tax_id, total_billed, total_paid, balance` | Cuenta corriente por administración. `balance > 0` = admin debe. |

Ambas con `security_invoker=true` — RLS aplica normalmente.

---

## 11. Flujos de negocio

Formato uniforme: **Actor / Trigger / Precondiciones / Input / Steps /
Postcondiciones / Errores posibles / Implicancias UI**.

### 11.1 Onboarding de una administración nueva

- **Actor**: admin (Vitalock)
- **Trigger**: firma de contrato con nuevo cliente
- **Precondiciones**: —
- **Input**:
  - Datos administración: `company_name` (req), `tax_id` (opcional pero único si viene), `email`, `phone`, `address`, `notes`
  - Lista de edificios: cada uno con `name` (req), `address`, `city`, `notes`
  - Lista de unidades por edificio: `number` (req), `unit_type` (opcional), `is_administrative` (default false)
- **Steps**:
  1. `INSERT INTO administrations(company_name, tax_id, ...)` → obtener `id`
  2. Para cada edificio: `INSERT INTO buildings(administration_id, name, ...)` → obtener `id`
  3. Para cada unidad: `INSERT INTO units(building_id, number, is_administrative, ...)`
- **Postcondiciones**:
  - Administración creada con `status='active'`
  - N edificios y M unidades listos para emitir llaves
- **Errores posibles**:
  - `unique_violation` en `tax_id` (CUIT duplicado)
  - `unique_violation` en `(building_id, number)` (número repetido en el mismo edificio)
  - `unique_violation` en `(building_id) WHERE is_administrative=true` (2+ admin units por edificio)
- **Implicancias UI**:
  - Wizard multi-step (admin → building → units) o forma anidada
  - Validar CUIT en frontend (formato XX-XXXXXXXX-X) antes de submit
  - Al agregar unidad admin, warning si el edificio ya tiene una

### 11.2 Alta inicial de llaves de un edificio

- **Actor**: admin (Vitalock)
- **Trigger**: instalación inicial o vecino nuevo con llaves originales
- **Precondiciones**: edificio con units + equipment ya creados
- **Input**: para cada llave a emitir: `unit_id`, `rfid_code` (leído del lector), `notes` opcional (nombre comprador, etc.); y lista de `equipment_id` donde debe estar cargada
- **Steps**:
  1. `INSERT INTO rfid_keys(unit_id, rfid_code, notes)` → obtener `id`
  2. Para cada equipo: `INSERT INTO key_authorizations(rfid_key_id, equipment_id)`
     → cada uno arranca en `sync_state='pending_install'`
- **Postcondiciones**:
  - Llave `active`
  - N autorizaciones `pending_install` en la worklist del instalador
- **Errores posibles**:
  - `unique_violation` en `rfid_code` (código físico ya emitido)
  - `check_violation`: llave y equipo deben ser del mismo edificio
  - `check_violation`: no se puede autorizar una llave lost/disabled o un equipo dead
- **Implicancias UI**:
  - Formulario con lector RFID integrado (Web Serial API o similar) para no tipear el código
  - Al elegir unit, precargar los equipos del edificio con checkboxes preseleccionados
  - Preview de "qué se va a cargar en qué equipo" antes de submit

### 11.3 Pedido de llaves — origen administración (auto-autorizado)

- **Actor**: admin (Vitalock)
- **Trigger**: admin del consorcio escribe por WhatsApp pidiendo llaves nuevas
- **Precondiciones**: unidad(es) target existente(s)
- **Input**:
  - `administration_id` (identificar admin por el contacto)
  - `requester_name` (nombre de quien escribió — persona real del consorcio)
  - `requester_contact` (opcional)
  - `pickup_person_{name,surname,dni}` (persona autorizada a retirar)
  - Líneas: `[{ unit_id, quantity, notes }, ...]`
  - `notes` header
- **Steps**:
  1. `INSERT INTO key_requests(requester_type='administration', requester_name, pickup_person_*, notes)`
     → trigger auto-completa: `status='authorized'`, `authorized_by=requester_name`, `authorized_at=now()`, `authorization_method='self'`
  2. Para cada línea: `INSERT INTO key_request_items(key_request_id, unit_id, quantity, notes)`
- **Postcondiciones**:
  - Solicitud en `authorized`, lista para producción
- **Errores posibles**:
  - `check_violation`: `requester_name` requerido
  - `check_violation`: unit debe ser de un edificio de la administración
- **Implicancias UI**:
  - Autocomplete de admin por nombre/CUIT
  - Selector jerárquico de unit (building → unit) filtrado por admin
  - Los datos del retirador se validan cliente-side (DNI numérico, nombres no vacíos)
  - Preview de "REQ-YYYY-XXXXXX" antes del submit (o mostrar el número después)

### 11.4 Pedido de llaves — origen particular (requiere autorización)

- **Actor**: admin (Vitalock)
- **Trigger**: particular (dueño/inquilino) escribe por WhatsApp pidiendo llave
- **Precondiciones**: unidad target existe
- **Input**:
  - Datos del solicitante: `requester_name, requester_surname, requester_dni, requester_contact` (todos requeridos)
  - Una línea: `unit_id`, `quantity` (típicamente 1)
- **Steps**:
  1. `INSERT INTO key_requests(requester_type='individual', requester_*, notes)`
     → `status='pending_authorization'` (default)
  2. `INSERT INTO key_request_items(key_request_id, unit_id, quantity)`
  3. Vitalock contacta a la administración (fuera de sistema, por WhatsApp/mail).
  4. **Si admin confirma**:
     ```sql
     UPDATE key_requests SET
       status = 'authorized',
       pickup_person_name = ..., pickup_person_surname = ..., pickup_person_dni = ...,
       authorized_by = 'Nombre del referente admin',
       authorized_at = now(),
       authorization_method = 'whatsapp'  -- o email/phone/in_person
     WHERE id = ...;
     ```
  5. **Si admin no confirma**:
     ```sql
     UPDATE key_requests SET
       status = 'rejected',
       rejection_reason = 'not_authorized_by_administration',  -- enum
       rejection_notes = 'texto libre opcional'
     WHERE id = ...;
     ```
- **Postcondiciones (si autorizado)**: sigue flow 11.5
- **Postcondiciones (si rechazado)**: request terminal, no se produce nada
- **Errores posibles**:
  - `check_violation`: individual requester debe tener surname, dni y contact
  - `check_violation`: `rejection_reason` requerido si `rejected`
  - `check_violation`: `pickup_person_*` requerido para pasar a `authorized`
- **Implicancias UI**:
  - Formulario con TODOS los campos del solicitante marcados como requeridos
  - Al autorizar, form separado para completar pickup_person + método
  - Al rechazar, dropdown con las 4 razones + textarea opcional

### 11.5 Producir llaves de un pedido autorizado

- **Actor**: admin (Vitalock, con lector RFID)
- **Trigger**: la oficina va a producir físicamente las llaves de un request
- **Precondiciones**: `key_request.status IN ('authorized', 'in_production')`
- **Input**: para cada llave a producir, el `rfid_code` (leído del lector) y el `key_request_item_id` (línea que fulfilla)
- **Steps**:
  - Para cada llave: `INSERT INTO rfid_keys(unit_id, rfid_code, key_request_item_id, notes)`
    (`unit_id` debe matchear `key_request_item.unit_id` — validado por trigger)
  - Triggers automáticos:
    - Al insertar la primera → `key_request.status` pasa a `'in_production'`
    - Al insertar la última que completa las quantities → pasa a `'ready_for_pickup'`
- **Postcondiciones**: N rfid_keys nuevas ligadas al request; status del request avanzado
- **Errores posibles**:
  - `check_violation`: no se puede producir para un request no authorized/in_production
  - `check_violation`: exceder la quantity de la línea
  - `check_violation`: `unit_id` de la llave debe matchear el `unit_id` del item
- **Implicancias UI**:
  - Pantalla "producir para REQ-XXX": muestra qué líneas faltan y cuánto
  - Loop de lectura RFID → auto-insert línea por línea con feedback visual
  - Al llegar a `ready_for_pickup`, notificar al admin que puede coordinar entrega

### 11.6 Retiro de llaves (entrega)

- **Actor**: admin (Vitalock, oficina)
- **Trigger**: la persona autorizada viene a retirar
- **Precondiciones**: `key_request.status = 'ready_for_pickup'`, DNI del retirador coincide con `pickup_person_dni`
- **Input**: `picked_up_by_name`, `picked_up_by_surname`, `picked_up_by_dni`, `delivered_by_staff_id` (auto: staff logueado); qué llaves específicas se llevan (puede ser todas o algunas)
- **Steps**:
  - Para cada llave que se entrega:
    ```sql
    UPDATE rfid_keys SET
      picked_up_at = now(),
      picked_up_by_name = ..., picked_up_by_surname = ..., picked_up_by_dni = ...,
      delivered_by_staff_id = <staff_id>
    WHERE id = ...;
    ```
  - Triggers automáticos:
    - Validación de DNI matching (rechaza si no coincide)
    - Cuando todas las llaves del request tienen `picked_up_at` → `key_request.status = 'delivered'`
- **Postcondiciones**: llaves entregadas; request avanza a `delivered` cuando se completa
- **Errores posibles**:
  - `check_violation`: `picked_up_by_dni` no matchea el DNI autorizado
  - `check_violation`: no se puede retirar de un request no ready_for_pickup
  - `check_violation`: pickup fields inmutables si `picked_up_at` ya está seteado
- **Implicancias UI**:
  - Escanear/tipear DNI del retirador → mostrar warning en amarillo si no matchea antes de submit
  - Confirmación explícita antes de UPDATE (irreversible)
  - Después del submit, mostrar recibo con nombre/DNI/fecha/hora

### 11.7 Reemplazo de equipo (equipo muerto)

- **Actor**: admin (Vitalock)
- **Trigger**: se detecta que un equipo se quemó o dejó de funcionar
- **Precondiciones**: equipo actual en `status IN ('active','maintenance')`
- **Input**:
  - `p_old_equipment_id`
  - `p_new_serial_number`, `p_new_model`, `p_new_description`, `p_new_access_type`
  - `p_decommission_reason` opcional
  - `p_replacement_staff_id` opcional (quién hizo el reemplazo)
- **Steps**:
  ```sql
  SELECT operations.replace_equipment(
    '<old_id>', 'SN-NUEVO', 'ACX-500', 'Descripcion', 'peatonal',
    'Se quemo por tormenta', '<staff_id>'
  );
  ```
- **Postcondiciones**:
  - Viejo: `status='dead'`, `decommissioned_at` seteado, autorizaciones cerradas
  - Nuevo: `status='active'`, `replaces_equipment_id` apunta al viejo, autorizaciones `installed` del viejo copiadas como `pending_install`
- **Errores posibles**:
  - Equipment ya `dead`
  - Serial nuevo duplicado
- **Implicancias UI**:
  - Confirmación destacada ("esto es irreversible; el viejo equipo pasa a dead")
  - Preview de qué autorizaciones se van a migrar
  - Después del submit, mostrar el nuevo `serial_number` + link al nuevo equipo

### 11.8 Llave perdida — flujo de revocación

- **Actor**: admin (Vitalock)
- **Trigger**: cliente reporta llave perdida
- **Precondiciones**: llave en `status='active'`
- **Input**: `rfid_code` o `id` de la llave; `notes` opcional
- **Steps**:
  ```sql
  UPDATE rfid_keys SET status='lost' WHERE id = ...;
  ```
- **Postcondiciones**:
  - `deactivated_at` completado (trigger)
  - Todas las autorizaciones `installed` → `pending_removal` (trigger via `revoke_key_from_all_equipment`)
  - Autorizaciones `pending_install` (nunca ejecutadas) → `removed` directamente
- **Errores posibles**: ninguno particular (la llave siempre puede marcarse lost)
- **Implicancias UI**:
  - Botón "Reportar perdida" en la ficha de la llave
  - Confirmación explícita (es irreversible; para reactivar hay que emitir otra llave)
  - Mostrar en pantalla la nueva worklist de revocación generada para el instalador

### 11.9 Cobrar por las llaves entregadas de un pedido

- **Actor**: admin (Vitalock)
- **Trigger**: llaves entregadas, hay que cobrarlas
- **Precondiciones**: `key_request.status = 'delivered'` (o al menos algunas llaves picked_up)
- **Input**: `administration_id`, items con `description`, `quantity`, `unit_price`, `related_key_request_item_id` (opcional pero recomendado para trazabilidad)
- **Steps**:
  1. `INSERT INTO bills(administration_id, notes)` → bill en `draft`, obtener `id`
  2. Para cada línea: `INSERT INTO bill_items(bill_id, product_id, description, quantity, unit_price, related_key_request_item_id)`
     → `subtotal` y `total_amount` auto-computados
  3. `UPDATE bills SET status='confirmed' WHERE id = ...;` → items ya no se pueden modificar
- **Postcondiciones**: bill confirmed lista para cobrar
- **Errores posibles**:
  - `check_violation`: no se puede agregar items a bill no-draft
  - `check_violation`: no se puede referenciar product inactivo
- **Implicancias UI**:
  - Pantalla "generar bill para REQ-XXX" con precarga de items sugeridos (una línea por key_request_item, con qty igual)
  - Precio negociado se completa manualmente
  - Botón "Confirmar" separado del "Guardar borrador"

### 11.10 Presupuesto (quote) → aceptación → bill

- **Actor**: admin (Vitalock)
- **Trigger**: cliente pide presupuesto formal (típicamente instalaciones)
- **Precondiciones**: administración existente
- **Input**:
  - Header: `administration_id`, `valid_until`, `notes`
  - Items: `description`, `quantity`, `unit_price`, `product_id` opcional
- **Steps**:
  1. `INSERT INTO quotes(administration_id, valid_until, notes)` → `status='draft'`
  2. `INSERT INTO quote_items(...)` × N
  3. `UPDATE quotes SET status='sent', sent_at=now() WHERE id=...;`
  4. **Si cliente acepta**: `UPDATE quotes SET status='accepted', accepted_at=now();`
  5. **Si rechaza/expira/cancela**: `UPDATE quotes SET status='rejected'|'expired'|'cancelled', rejection_reason=...;`
  6. **Convertir a bill (si accepted)**:
     - `INSERT INTO bills(administration_id, from_quote_id=<quote>, notes)`
     - `INSERT INTO bill_items(...)` copiando líneas manualmente (o via función helper — hoy no implementada)
     - `UPDATE bills SET status='confirmed';`
- **Postcondiciones**: quote accepted + bill confirmed linkeada
- **Errores posibles**: transiciones inválidas de status
- **Implicancias UI**:
  - Editor de quote con preview del total
  - Botón "Enviar" (draft → sent), "Marcar aceptado", "Convertir a factura"
  - Al convertir, mostrar los items del quote precargados y editables una última vez antes de confirmar

### 11.11 Cargos recurrentes mensuales

- **Actor**: admin (Vitalock) o cron
- **Trigger**: comienza el mes; hay que generar los abonos
- **Precondiciones**: `recurring_charges` activos existentes
- **Input**: `year`, `month`
- **Steps**:
  ```sql
  SELECT sales.generate_recurring_charges(2026, 9);
  ```
  → retorna cantidad de bills creadas
- **Postcondiciones**: bills confirmed del mes creadas para cada recurring_charge activo, sin duplicar si ya se corrió antes
- **Errores posibles**: `p_year` o `p_month` fuera de rango
- **Implicancias UI**:
  - Sección "Cobros recurrentes" con lista y estado por mes
  - Botón "Generar cargos de <mes>" (idempotente — puede correrse varias veces)
  - Notificación de resultado ("se generaron X bills")
- **Automatización**: hay un `pg_cron` job (`sales-generate-monthly-charges`) que corre el 1° de cada mes a las 08:00 UTC.

### 11.12 Registrar un pago

- **Actor**: admin (Vitalock)
- **Trigger**: la admin paga
- **Precondiciones**: bill en `status='confirmed'` sin pago previo
- **Input**: `bill_id`, `payment_method`, `amount` (debe == bill.total_amount), `reference`, `notes`
- **Steps**:
  ```sql
  INSERT INTO payments(administration_id, bill_id, payment_method, amount, reference)
  VALUES (...);
  ```
  → `requires_invoice` auto-completado según método
- **Postcondiciones**: pago registrado; aparece en `pending_to_invoice` si no es cash
- **Errores posibles**:
  - `unique_violation` en `bill_id` (ya hay un pago para esa bill)
  - `check_violation`: `amount != bill.total_amount`
  - `check_violation`: bill no confirmed
- **Implicancias UI**:
  - En la ficha de una bill confirmed, botón "Registrar pago"
  - Amount precargado con `bill.total_amount` (no editable — la DB rechaza otro valor)
  - Dropdown de método con feedback visual: "cash → no requiere factura" o "transfer → aparecerá en pendientes de facturar"

### 11.13 Marcar pago como facturado (contadora)

- **Actor**: admin (Vitalock, con datos que le pasó la contadora)
- **Trigger**: la contadora emitió la factura formal
- **Precondiciones**: payment con `requires_invoice=true`, `invoiced_at IS NULL`
- **Input**: `payment_id`
- **Steps**:
  ```sql
  UPDATE payments SET invoiced_at = now() WHERE id = ...;
  ```
- **Postcondiciones**: sale de la view `pending_to_invoice`
- **Errores posibles**: ninguno particular
- **Implicancias UI**:
  - Pantalla "Pendientes de facturar" alimentada por `sales.pending_to_invoice`
  - Botón "Marcar como facturado" por row (o batch)

### 11.14 Cancelar un pedido antes de la entrega

- **Actor**: admin (Vitalock)
- **Trigger**: solicitante desiste, o hay problema
- **Precondiciones**: `key_request.status != 'delivered'`
- **Input**: `id`, `cancellation_reason` (free text, requerido)
- **Steps**:
  ```sql
  UPDATE key_requests SET status='cancelled', cancellation_reason='...' WHERE id=...;
  ```
- **Postcondiciones**: request terminal
- **Errores posibles**:
  - `check_violation`: `cancellation_reason` requerido
  - Transición inválida (no se puede cancelar delivered)
- **Notas**: si algunas llaves ya se retiraron y otras no, las retiradas quedan válidas; el request pasa a cancelled con nota. La app puede prevenir esto con confirmación explícita.

### 11.15 Ticket de mantenimiento con equipo específico

- **Actor**: admin (Vitalock, registra); installer (Vitalock, resuelve)
- **Trigger**: admin reporta que un equipo específico falla
- **Precondiciones**: equipo existente
- **Input (crear)**: `administration_id`, `building_id`, `equipment_id`, `category='maintenance'`, `description`, `opened_by_staff_id`
- **Steps**:
  1. `INSERT INTO tickets(...)` → `status='open'`, `ticket_number` auto
  2. Admin asigna al installer:
     ```sql
     UPDATE tickets SET status='in_progress', assigned_to_staff_id=<installer_id> WHERE id=...;
     ```
     → Trigger auto: `equipment.status = 'maintenance'` (si estaba active)
  3. Installer va al sitio, agrega comentarios:
     ```sql
     INSERT INTO ticket_comments(ticket_id, author_staff_id, body) VALUES (...);
     ```
  4. Installer resuelve:
     ```sql
     UPDATE tickets SET status='resolved', resolution_notes='...', resolved_by_staff_id=<self>
     WHERE id=...;
     ```
     → Trigger llena `resolved_at`
  5. Admin decide cuándo el equipo vuelve a `active` (manual, no auto):
     ```sql
     UPDATE operations.equipment SET status='active' WHERE id=<equipment_id>;
     ```
  6. Si es cobrable (no está en abono): flujo 11.9 con `related_bill_id` linkeado.
  7. Si el problema vuelve: `UPDATE tickets SET status='in_progress' WHERE id=...;`
     → Trigger limpia `resolution_notes`, `resolved_at`, `resolved_by_staff_id`.
- **Postcondiciones**: ticket resuelto o cerrado; equipo posiblemente vuelto a active
- **Errores posibles**:
  - `check_violation`: `resolution_notes` requerido si resolved
  - `check_violation`: unit/equipment deben pertenecer al mismo building del ticket
  - `insufficient_privilege`: installer intenta reasignar el ticket
- **Implicancias UI**:
  - Instalador ve worklist filtrada por `assigned_to = él`
  - Timeline de comentarios con avatar de autor + timestamp
  - Botón "Resolver" pide `resolution_notes`
  - En la ficha del equipo, warning si tiene ticket abierto

### 11.16 Ticket de mantenimiento sin equipo específico (fallo general)

- **Actor**: admin
- **Trigger**: reporte de fallo general del edificio (ej. corte de luz)
- **Input**: `administration_id`, `building_id`, `category='maintenance'`, `description`, sin `equipment_id`
- **Diferencias del flow 11.15**:
  - No hay auto-transición de equipo
  - El admin puede marcar equipos individuales como `maintenance` manualmente si aplica

### 11.17 Ticket de instalación (venta grande)

- **Actor**: admin
- **Trigger**: se aprobó una instalación (típicamente por acceptance de un quote)
- **Input**: `administration_id`, `building_id`, `category='installation'`, `description` (qué instalar), `related_bill_id` (opcional al inicio)
- **Steps**: similar a 11.15 pero sin auto-transición de equipo (no hay equipo aún — lo va a crear el instalador cuando termine)
- **Post-instalación**: el equipo nuevo se crea via `INSERT INTO operations.equipment(...)` linkeado en el `notes` del ticket resuelto

### 11.18 Atomic resolution of equipment_installation and equipment_replacement tickets

These two ticket categories require the **admin** (not the installer) to complete them. The installer app displays them as read-only "Pendiente de admin" cards and excludes them from the batch-resolve toolbar.

**equipment_installation** (category guard: `equipment_installation` only):

- Admin opens `AssignEquipmentDialog` from `TareaDetailPage`, enters the new serial number.
- Client calls `public.resolve_equipment_installation(p_ticket_id, p_serial, p_unit_id, p_note)`.
- The RPC atomically:
  1. Creates the `operations.equipment` row (status=`active`).
  2. If the originating `order_item` has `product_id IS NOT NULL`: emits `egreso_instalacion` (-qty) + `liberacion_reserva` (+qty) stamped with the same `ticket_id`, `order_item_id`, and `product_id`.
  3. Resolves the ticket via the two-step state machine (`open → in_progress → resolved`).
- No separate `resolve_ticket` call is needed — the RPC closes the ticket.

**equipment_replacement** (category guard: `equipment_replacement` only):

- Admin opens `AssignEquipmentDialog`, selects the old equipment and enters new serial + model.
- Client calls `public.resolve_equipment_replacement(p_ticket_id, p_old_equipment_id, p_new_serial, p_new_model, ...)`.
- The RPC atomically:
  1. Calls `operations.replace_equipment` to swap the physical device and migrate `key_authorizations`.
  2. If the originating `order_item` has `product_id IS NOT NULL`: emits `egreso_reemplazo` (-qty) + `liberacion_reserva` (+qty).
  3. Updates `support.tickets.equipment_id` to the new equipment UUID.
  4. Resolves the ticket via the two-step state machine.
- Old equipment status becomes `dead`; new equipment is `active`.

**Stock closure invariant**: for every resolved `equipment_installation` or `equipment_replacement` ticket with a `reserva` movement where `product_id IS NOT NULL`, the ledger MUST contain a matching definitive egress (`egreso_instalacion` or `egreso_reemplazo`) plus a `liberacion_reserva` with the same `ticket_id`. The backfill DO block in migration `20260812000061` retroactively closes this gap for historical tickets.

**Installer exclusion**: `TicketsSection` derives two arrays from the ticket list — `selectable` (stock-neutral: `maintenance`, `installation`) and `pendingAdmin` (equipment categories). Only `selectable` tickets appear in the batch-resolve toolbar. `pendingAdmin` tickets are rendered as non-interactive read-only cards.

### 11.19 Consultas típicas (queries de dashboard)

Ejemplos de queries útiles para dashboards y reportes:

```sql
-- Worklist del instalador para el equipo peatonal-01
SELECT ka.id, ka.sync_state, k.rfid_code, u.number as unit
FROM operations.key_authorizations ka
JOIN public.rfid_keys k ON k.id = ka.rfid_key_id
JOIN public.units u ON u.id = k.unit_id
WHERE ka.equipment_id = '<id>'
  AND ka.sync_state IN ('pending_install', 'pending_removal');

-- Solicitudes pendientes de autorización
SELECT * FROM sales.key_requests WHERE status = 'pending_authorization';

-- Solicitudes listas para retirar
SELECT kr.request_number, kr.pickup_person_name || ' ' || kr.pickup_person_surname AS pickup_person,
       kr.pickup_person_dni, kr.received_at
FROM sales.key_requests kr
WHERE kr.status = 'ready_for_pickup';

-- Cuenta corriente
SELECT * FROM sales.administration_balance ORDER BY balance DESC;

-- Pagos pendientes de facturar (para contadora)
SELECT * FROM sales.pending_to_invoice ORDER BY payment_date;

-- Tickets abiertos por administración
SELECT a.company_name, count(*) as open_tickets
FROM support.tickets t
JOIN public.administrations a ON a.id = t.administration_id
WHERE t.status IN ('open', 'in_progress')
GROUP BY a.company_name;
```

---

## 12. Garantías automáticas de la DB (invariantes)

Estas invariantes las hace cumplir la base, no la aplicación. La app **no
puede** violarlas ni con `UPDATE`/`INSERT`/`DELETE` directo. La app **no debe**
duplicar estas validaciones (ineficiente); solo hacer validación cliente-side
opcional para UX.

### 12.1 Identidad e integridad referencial

- `rfid_keys.rfid_code` único global
- `equipment.serial_number` único global
- `units(building_id, number)` único
- `units(building_id) WHERE is_administrative=true` único (una admin unit por edificio)
- `key_authorizations(rfid_key_id, equipment_id)` único
- `payments.bill_id` único (un pago por bill)
- **No se puede DELETE** con FK RESTRICT: administrations con edificios, buildings con units, units con keys, keys con autorizaciones, etc.
- **No se puede eliminar una bill** con payments (FK RESTRICT).
- **No se puede cancelar una bill** con payments (trigger).

### 12.2 Inmutabilidad de datos críticos

| Tabla | Campos inmutables una vez creados |
|---|---|
| `rfid_keys` | `unit_id`, `rfid_code`, `key_request_item_id` (si aplica) |
| `rfid_keys` (post-pickup) | `picked_up_at`, `picked_up_by_*`, `delivered_by_staff_id` |
| `equipment` | `serial_number`, `building_id`, `replaces_equipment_id`, `installed_at` |
| `key_authorizations` | `rfid_key_id`, `equipment_id` |
| `key_requests` (post-authorized) | `pickup_person_name`, `pickup_person_surname`, `pickup_person_dni` |
| `bills` | `administration_id`, `from_quote_id` |
| `bill_items`, `quote_items` | No modificables si `parent.status != 'draft'` |
| `payments` | `bill_id`, `amount`, `payment_method` |
| `tickets` | `administration_id`, `building_id`, `category`, `opened_at`, `opened_by_staff_id` |
| `ticket_comments` | Toda la row — append-only, no UPDATE ni DELETE |

### 12.3 Coherencia entre entidades

- `key_authorization`: llave y equipo deben ser del **mismo edificio**
- `equipment.replaces_equipment_id`: predecesor debe ser del **mismo edificio** y estar en `status='dead'`
- `key_request_item.unit_id`: debe ser de un edificio de `key_request.administration_id`
- `rfid_keys.unit_id`: si se produce contra un `key_request_item`, debe matchear el `unit_id` del item
- **No se pueden producir más rfid_keys** que la `quantity` de una `key_request_item`
- **DNI del retirador** en `rfid_keys.picked_up_by_dni` debe matchear `key_requests.pickup_person_dni`
- **`ticket.unit_id`** debe ser del `ticket.building_id`
- **`ticket.equipment_id`** debe ser del `ticket.building_id`
- **Items** de bill/quote no pueden referenciar `products` con `is_active=false` (nuevos; históricos ok)

### 12.4 Máquinas de estado enforceadas

Ver [sección 8.1](#81-estados-de-entidades) para valores. Reglas de transición:

- **`rfid_keys.status`**: `active → disabled | lost` (irreversible; para reactivar, emitir nueva llave)
- **`equipment.status`**:
  - `active ↔ maintenance` (bidireccional)
  - `active | maintenance → dead` (terminal)
  - **`dead → *` bloqueado**
- **`key_authorizations.sync_state`**:
  - `pending_install → installed` (normal)
  - `pending_install → removed` (cancelación antes de instalar)
  - `installed → pending_removal → removed`
  - Toda otra transición: bloqueada
- **`key_requests.status`** (permite saltos hacia adelante para batch inserts):
  - `pending_authorization → authorized | rejected | cancelled`
  - `authorized → in_production | ready_for_pickup | delivered | cancelled`
  - `in_production → ready_for_pickup | delivered | cancelled`
  - `ready_for_pickup → delivered | cancelled`
  - Terminales: `delivered`, `rejected`, `cancelled` (no vuelven)
- **`bills.status`**:
  - `draft → confirmed → cancelled` (cancelled terminal)
- **`quotes.status`**:
  - `draft → sent | cancelled`
  - `sent → accepted | rejected | expired | cancelled`
  - Terminales: `accepted`, `rejected`, `expired`, `cancelled`
- **`tickets.status`**:
  - `open → in_progress | cancelled`
  - `in_progress → resolved | cancelled`
  - `resolved → in_progress` (reapertura)

### 12.5 Cascadas operativas automáticas

Estas ocurren via triggers sin que la app tenga que orquestarlas:

- Marcar `rfid_key.status = lost|disabled` → invoca `revoke_key_from_all_equipment` → autorizaciones installed pasan a `pending_removal`, pending_installs a `removed`.
- Marcar `equipment.status = dead` → cierra sus autorizaciones (installed→pending_removal→removed; pending_install→removed).
- Producir la última rfid_key de un `key_request` → status pasa a `ready_for_pickup`.
- Marcar todas las llaves del request como picked_up → status pasa a `delivered`.
- Ticket con `equipment_id` + `category=maintenance` pasa a `in_progress` → `equipment.status = maintenance`.
- Insert/Update/Delete de `bill_items`/`quote_items` → recomputa `parent.total_amount`.
- Insert/Update de items → autocomputa `subtotal = quantity × unit_price`.
- Insert de `payment` → autocompleta `requires_invoice = (method != 'cash')`.

### 12.6 Auditoría automática

- Toda tabla (excepto `ticket_comments`) tiene `updated_at` autoactualizado.
- Timestamps de eventos clave se completan solos:
  - `rfid_keys.deactivated_at` al pasar a disabled/lost
  - `equipment.decommissioned_at` al pasar a dead
  - `key_authorizations.installed_at` al pasar a installed
  - `key_authorizations.removed_at` al pasar a removed
  - `tickets.resolved_at` al pasar a resolved

### 12.7 Defensas de infraestructura

- `statement_timeout`: `authenticated=10s`, `anon=3s`. Previene queries runaway.
- Rol `anon` sin acceso a schemas privados (`identity`, `operations`, `sales`, `support`).
- Vistas con `security_invoker=true` (no bypasean RLS).
- SECURITY DEFINER functions con `search_path=""` (no vulnerables a function hijacking).

---

## 13. Catálogo de errores

Todos los errores que la DB puede lanzar hacia la app, con SQLSTATE, causa y
sugerencia de mensaje user-facing en español.

### 13.1 Formato de error de Postgres

En `supabase-js`, los errores llegan como:
```js
{ code: 'SQLSTATE', message: 'mensaje del DB', details: '...', hint: '...' }
```

### 13.2 Errores por categoría

#### Violaciones de unicidad (`23505` / `unique_violation`)

| Mensaje contiene | Causa | Sugerencia UI |
|---|---|---|
| `administrations_tax_id_key` | CUIT duplicado | "El CUIT ya está registrado en otra administración." |
| `rfid_keys_rfid_code_key` | Código RFID duplicado | "Ese código RFID ya está emitido. Verificá que el lector no lo haya duplicado." |
| `equipment_serial_number_key` | Serial equipo duplicado | "El número de serie ya está registrado en otro equipo." |
| `units_building_number_unique` | Unidad duplicada en el edificio | "Ya existe una unidad con ese número en este edificio." |
| `units_one_admin_per_building_idx` | 2+ admin units por edificio | "Este edificio ya tiene una unidad administrativa. Solo se permite una por edificio." |
| `key_authorizations_key_equipment_unique` | Llave ya autorizada en ese equipo | "Esta llave ya está autorizada en ese equipo." |
| `payments_bill_id_key` | Bill ya tiene pago | "Esta factura ya tiene un pago registrado." |
| `staff_email_key` / `staff_auth_user_id_key` | Email/user duplicado | "Ya existe un empleado con ese email/usuario." |

#### Violaciones de check / triggers (`23514` / `check_violation`)

| Mensaje del DB | Causa | Sugerencia UI |
|---|---|---|
| `... is immutable` | Se intentó modificar un campo inmutable | "Este dato no se puede modificar una vez creado. Si necesitás corregirlo, hablá con soporte." |
| `invalid ... status transition: X -> Y` | Transición prohibida | "No se puede cambiar el estado de X a Y. Estados permitidos: [...]." |
| `key and equipment must belong to the same building` | Cross-building auth | "No se puede autorizar una llave para un equipo de otro edificio." |
| `cannot authorize an rfid_key with status=lost` | Autorizar llave no active | "No se puede autorizar una llave perdida/desactivada." |
| `cannot authorize on equipment with status=dead` | Autorizar en equipo dead | "No se puede autorizar en un equipo dado de baja." |
| `unit ... belongs to administration ...` | Unit de otra admin | "La unidad seleccionada no pertenece a esta administración." |
| `cannot produce more keys than requested for this line` | Sobre-producción | "Ya se produjeron todas las llaves solicitadas en esta línea. Aumentá la cantidad o creá otra línea." |
| `cannot produce a key for a request in status ...` | Producir en status prohibido | "No se pueden producir llaves para esta solicitud (estado: X)." |
| `pickup DNI ... does not match the authorized pickup person DNI ...` | DNI no matchea | "El DNI no coincide con la persona autorizada a retirar. Verificá el documento." |
| `cannot pickup a key while the request is in status ...` | Retiro en status prohibido | "La solicitud no está lista para retirar (estado: X)." |
| `pickup person data is immutable once the request is authorized` | Modificar retirador post-auth | "No se puede cambiar la persona autorizada una vez que la solicitud está autorizada." |
| `resolution_notes required when status=resolved` | Cerrar ticket sin notas | "Agregá una nota de resolución antes de cerrar el ticket." |
| `cancellation_reason required when status=cancelled` | Cancelar sin motivo | "Escribí un motivo antes de cancelar." |
| `cannot cancel bill ... — it has ... payment(s) attached` | Cancelar bill con pago | "Esta factura ya fue pagada. Para anularla hay que revertir el pago primero." |
| `payment amount ... must equal bill total ...` | Monto ≠ total | "El monto del pago debe ser exacto: X. No se aceptan pagos parciales." |
| `cannot register payment for bill in status ...` | Pago en bill no confirmed | "La factura debe estar confirmada antes de registrar el pago." |
| `product ... is inactive and cannot be referenced` | Producto inactivo | "El producto seleccionado está discontinuado. Elegí otro." |
| `individual requester must have surname, dni and contact` | Faltan datos particular | "Para solicitantes particulares, completá nombre, apellido, DNI y contacto." |
| `pickup person (name, surname, dni) is required once status is authorized` | Autorizar sin retirador | "Antes de autorizar, completá los datos de la persona autorizada a retirar." |
| `equipment.status transitions out of dead are forbidden` | Resucitar equipo | "Un equipo dado de baja no se puede reactivar. Registrá uno nuevo como reemplazo." |
| `replacement must be at the same building` | Reemplazo cross-building | "El equipo de reemplazo debe estar en el mismo edificio que el original." |
| `predecessor equipment ... must be status=dead to be replaced` | Reemplazar vivo | "Solo se pueden reemplazar equipos dados de baja (status='dead')." |
| `equipment ... is already dead` | Doble baja | "Este equipo ya fue dado de baja." |
| `ticket_comments are append-only` | Editar/borrar comment | "Los comentarios no se pueden editar ni borrar. Agregá uno nuevo aclarando." |

#### Foreign key violations (`23503` / `foreign_key_violation`)

| Contexto | Mensaje | Sugerencia UI |
|---|---|---|
| DELETE sobre parent con hijos | `... violates foreign key constraint ...` | "No se puede eliminar: existen registros que dependen de este. Marcalo como inactivo en su lugar." |

#### RLS / privilegios (`42501` / `insufficient_privilege`)

| Contexto | Sugerencia UI |
|---|---|
| Installer intenta acceder a sales | "No tenés permiso para ver esta información." |
| Installer intenta reasignar un ticket | "No tenés permiso para reasignar tickets. Solo un admin puede hacerlo." |
| Cualquier operación denegada por RLS | "No tenés permiso para realizar esta acción." |

#### Not null violations (`23502` / `not_null_violation`)

Suelen indicar bug en la app (falta un campo required). El error tiene el
nombre de la columna: `null value in column "campo" of relation "tabla"`.
Mostrar mensaje genérico: "Faltan datos requeridos. Verificá el formulario."

### 13.3 Estrategia general

**Client-side pre-validation**: la app debe validar cliente-side lo obvio
(campos requeridos, formatos de DNI/email, transiciones de estado
correctas) para dar feedback inmediato al usuario. Pero **nunca omitir la
validación server-side** — la DB es la fuente de verdad.

**Fallback genérico**: para errores no catalogados, mostrar
"Ocurrió un error. Intentá de nuevo. Si persiste, contactá a soporte con
el código: <SQLSTATE>."

---

## 14. Fuera de scope (por diseño)

Estas cosas quedaron fuera **a propósito**, no son bugs. La app **no debe**
intentar implementarlas.

### 14.1 Modelado

- **Propietarios e inquilinos** no son entidades. Sus datos (nombre, DNI, contacto) se capturan como texto libre en `rfid_keys.notes` y `key_requests.requester_*`.
- **Llaves administrativas multi-edificio**: cada llave admin pertenece a un solo edificio. Si un administrador general necesita entrar a dos edificios, son dos llaves.
- **Múltiples slots administrativos por edificio**: solo uno.
- **Diferenciación fina por puerta**: el modelo N:M lo soporta, pero hoy la mayoría de los edificios cargan las mismas llaves en todos los equipos.

### 14.2 Operación

- **Sync online con equipos**: hoy es 100% manual (instalador va físicamente).
- **Reseteo automático de sync tras mantenimiento**: si el equipo vuelve con memoria borrada, decidir manualmente.
- **Timeout de pedidos en `ready_for_pickup`**: sin `on_hold` ni job de expiración.

### 14.3 Producto

- **Facturación AFIP formal**: la contadora emite externamente. No hay CAE, PDFs, punto de venta ni numeración AFIP-compliant.
- **Pagos parciales**: un pago cubre 100% de la bill.
- **Notas de crédito / devoluciones**: no modeladas.
- **Múltiples monedas**: solo ARS.
- **Access events**: logs de "quién pasó por qué puerta" — descartado por el negocio, Vitalock no hace seguimiento de accesos.
- **Multi-tenancy real**: administraciones y particulares no se loguean. Todas las policies RLS asumen usuarios internos Vitalock.
- **Audit log transversal**: sin `pgaudit` ni tabla `audit_log` genérica. Auditoría es por columnas específicas.

---

## 15. Roadmap

**La DB está terminada.** Lo que sigue es capa de aplicación:

1. **Apps de cliente**:
   - Admin de Vitalock (dashboard completo).
   - Instalador (worklist + tickets asignados).
2. **Bot de WhatsApp**: recibe pedidos de admin y crea `sales.key_requests` (auto-autorizados). Usa `service_role`. Todo lo demás (urgencias, presupuestos) se carga manualmente.
3. **Provisioning de usuarios**: invitación via Supabase Auth Admin API + linkeo con `identity.staff`.

**Cambios futuros de DB** que podrían aparecer:

- Multi-tenancy si en algún momento las administraciones se loguean → tabla `administration_members` + policies scoping.
- Notas de crédito si aparece la necesidad.
- Rol de solo-lectura para contador externo (si se decide darle acceso).

---

## 16. Desarrollo local y testing

### 16.1 Levantar el stack

```bash
supabase start       # levanta Postgres + servicios locales
supabase db reset    # aplica migraciones + seed
```

Studio: http://127.0.0.1:54323 (schema visualizer con selector de schema).

Postgres directo: `psql postgres://postgres:postgres@127.0.0.1:54322/postgres`.

### 16.2 Simular RLS en `psql`

Para verificar que las policies funcionan como espera la app:

```sql
-- 1) Crear un auth.users y linkearlo a un staff existente:
insert into auth.users (id, instance_id, email, aud, role, created_at, updated_at)
values ('<uuid>', '00000000-0000-0000-0000-000000000000',
        'test@x.local', 'authenticated', 'authenticated', now(), now());

update identity.staff set auth_user_id = '<uuid>' where full_name = 'Bruno Benitez';

-- 2) Simular la sesión desde ese usuario:
set role authenticated;
set request.jwt.claim.sub = '<uuid>';

-- 3) Correr queries — RLS aplica como si fueras esa persona:
select count(*) from sales.bills;  -- 0 si es installer
```

### 16.3 Cron

`pg_cron` job activo: `sales-generate-monthly-charges`, corre `0 8 1 * *` (día 1 a las 08:00 UTC).

```sql
select * from cron.job;
select * from cron.job_run_details order by end_time desc limit 10;
```

### 16.4 Smoke tests documentados

Ver README.md sección "Queries de humo" para tests de invariantes.

---

## 17. Referencia de sample data (seed)

El seed carga escenarios reales con UUIDs conocidos para referenciar en
tests y documentación.

### 17.1 Administrations

| ID | Company | CUIT |
|---|---|---|
| `11111111-1111-1111-1111-111111111111` | Administracion Central SRL | 30-71234567-8 |
| `22222222-2222-2222-2222-222222222222` | Consorcios del Sur SA | 30-70999888-1 |

### 17.2 Buildings

| ID | Name | Administration |
|---|---|---|
| `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1` | Torre Callao | Admin Central |
| `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2` | Edificio Palermo Loft | Admin Central |
| `bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1` | Complejo Barracas | Consorcios del Sur |

### 17.3 Staff

| ID | Nombre | Rol | Estado |
|---|---|---|---|
| `99999999-9999-9999-9999-999999999901` | Ana Alvarez | admin | active |
| `99999999-9999-9999-9999-999999999902` | Bruno Benitez | installer | active |
| `99999999-9999-9999-9999-999999999903` | Carla Cordoba | installer | active |
| `99999999-9999-9999-9999-999999999905` | Elena Espinoza | installer | inactive |

### 17.4 Equipment

| ID | Serial | Building | Status |
|---|---|---|---|
| `f0000000-0000-0000-0000-000000000001` | SN-TC-PEATONAL-01 | Torre Callao | active |
| `f0000000-0000-0000-0000-000000000002` | SN-TC-COCHERA-01 | Torre Callao | active |
| `f0000000-0000-0000-0000-000000000003` | SN-TC-SERVICE-OLD | Torre Callao | dead |
| `f0000000-0000-0000-0000-000000000004` | SN-TC-SERVICE-02 | Torre Callao | active (reemplaza al 003) |
| `f0000000-0000-0000-0000-000000000005` | SN-PL-PEATONAL-01 | Palermo Loft | maintenance |
| `f0000000-0000-0000-0000-000000000006` | SN-CB-PEATONAL-01 | Complejo Barracas | active |
| `f0000000-0000-0000-0000-000000000007` | SN-CB-LOCALES-01 | Complejo Barracas | active |

### 17.5 Key requests (con sus estados)

| Número | Requester type | Status |
|---|---|---|
| `REQ-2026-000001` | administration | delivered |
| `REQ-2026-000002` | individual | pending_authorization |
| `REQ-2026-000003` | administration | in_production |

### 17.6 Bills

| Número | Total | Status | Payment |
|---|---|---|---|
| `VNT-2026-000001` | $51.000 | confirmed | Transfer (pendiente de facturar) |
| `VNT-2026-000002` | $1.010.000 | confirmed | Cash (no requiere factura) |
| `VNT-2026-000003` | $65.000 | confirmed | Sin pago (Admin Central debe) |

### 17.7 Tickets

| Número | Category | Status |
|---|---|---|
| `SOP-2026-000001` | maintenance | open (edificio Torre Callao completo) |
| `SOP-2026-000002` | maintenance | in_progress (asignado a Carla, equipo CB-LOCALES) |
| `SOP-2026-000003` | installation | resolved (asignado a Bruno, vinculado a bill 000002) |

### 17.8 Recurring charges

- Admin Central: $65.000/mes desde hace 6 meses
- Consorcios del Sur: $65.000/mes desde hace 3 meses
