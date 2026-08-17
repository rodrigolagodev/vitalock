# Auditoría de Seguridad Vitalock — Capas 1, 2, 3

**Fecha:** 2026-08-17
**Alcance:** Base de datos / Supabase (capa 1), Auth (capa 2), Frontend (capa 3)
**Estado:** Pre-producción. Capas 4 (hosting/GitHub Pages) y 5 (superficie general) pendientes.

## Notas de calibración

- Varios hallazgos originales de los agentes ya estaban resueltos en migraciones posteriores (marcados FIXED). Este documento lista solo lo que **queda abierto**.
- Algunos hallazgos requieren verificación en el dashboard de Supabase (rate limiting, JWT expiry) — no están en código. Están marcados como **VERIFICAR**.

---

## 🔴 CRÍTICO — no salir a producción sin resolver

### 1. `seed.sql` contiene dos cuentas con passwords conocidos

**Archivos:** `supabase/seed.sql:610-636`

- `ana@vitalock.example` / `admin1234` (rol admin)
- `bruno@vitalock.example` / `installer1234` (rol installer)

**Riesgo:** si `seed.sql` corre en prod, cualquiera con esos credenciales entra como admin y lee/modifica todo el sistema.

**Contexto:** `supabase/config.toml:66-71` tiene `sql_paths = ["./seed.sql"]`, por lo que corre en cada `db reset`.

**Fix propuesto:**

- Separar seeds por entorno (`seed.dev.sql` vs `seed.prod.sql` vacío).
- O envolver las inserciones en `auth.users` detrás de un `IF current_setting('app.environment', true) = 'local'`.
- Como mínimo: confirmar que la config de prod NO apunte a este archivo, y documentarlo prominentemente.

---

### 2. Sin Content-Security-Policy

**Archivos:** `apps/admin/index.html`, `apps/installer/index.html`

**Riesgo:** sin CSP, si un paquete de npm se compromete (supply chain), el atacante puede ejecutar código arbitrario contra el backend usando la sesión del usuario logueado.

**Fix propuesto:** agregar en el `<head>` de ambos:

```html
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://*.supabase.co; frame-ancestors 'none'; base-uri 'self'; form-action 'self'">
```

`'unsafe-inline'` en `style-src` es un tradeoff para Vite sin nonces. Se puede endurecer después.

---

### 3. VERIFICAR: rate limiting en login

**Archivo:** `packages/shared/src/auth/useAuth.ts:164-192`

**Situación:** el código de la app no implementa rate limiting propio. Supabase Auth **sí** trae rate limiting a nivel plataforma (default: 30 req/hora por IP en `signIn`), pero hay que confirmar en el dashboard.

**Acción:** Supabase → Auth → Rate Limits. Verificar valores. Considerar Turnstile/hCaptcha en el form para defensa extra contra bots.

---

## 🟠 ALTO

### 4. Password validation con `min(1)`

**Archivos:** `apps/admin/src/routes/LoginPage.tsx:10`, `apps/installer/src/routes/LoginPage.tsx:10`

```typescript
password: z.string().min(1, 'La contraseña es requerida')
```

**Riesgo:** un solo carácter pasa validación en el cliente. La política real la impone Supabase, pero el form no debería aceptar inputs absurdos.

**Fix:** `z.string().min(8, 'Mínimo 8 caracteres')` en ambos apps. Confirmar en Supabase → Auth → Policies que el servidor también exige 8+.

---

### 5. Sin `frame-ancestors` → clickjacking posible

**Archivos:** ambos `index.html`.

**Riesgo:** un atacante puede embeber el admin en un iframe transparente y engañar al usuario para que haga clic en operaciones sensibles.

**Fix:** se resuelve con el CSP del punto 2 (`frame-ancestors 'none'`).

---

### 6. VERIFICAR: scope del Service Worker del installer

**Archivos:** `apps/installer/dist/registerSW.js`, `apps/installer/vite.config.ts:29-31`, `apps/installer/dist/manifest.webmanifest`

**Situación:** el agente detectó que el SW podría estar registrando con `scope: '/'` cuando el deploy vive en `/vitalock/installer/`. Si es así:

- El SW no cachea correctamente los recursos del installer.
- Un SW rogue en `/` podría interceptar TODO el dominio (incluido admin).

**Acción:** abrir DevTools → Application → Service Workers en la app deployada. Si el scope registrado es `/`, corregir el `scope` en el config de VitePWA y en el `manifest.webmanifest` a `/vitalock/installer/`.

---

### 7. Sesión sin idle timeout

**Archivos:** `packages/supabase/src/client.ts:12-14`, `packages/shared/src/auth/useAuth.ts`

```typescript
auth: { persistSession: true, autoRefreshToken: true }
```

**Riesgo:** la sesión se refresca indefinidamente. Si roban un dispositivo o dejan una PC del sitio abierta, la sesión funciona por días.

**Fix:** dos capas.

- **Server:** Supabase → Auth → JWT expiry en ~1h (verificar default).
- **Cliente:** idle logout a los 30min sin actividad. `useEffect` con listeners de `mousemove`/`keydown` que resetea un timer y llama a `signOut()` al vencer.

---

### 8. Installer puede UPDATE cualquier columna de `key_authorizations`

**Contexto:** las policies dejan al installer hacer `UPDATE` sobre la tabla sin restricción de columnas. La inmutabilidad de `rfid_key_id` y `equipment_id` está protegida por trigger, pero `installed_by_staff_id`, `remove_reason`, `notes`, etc. son mutables.

**Fix:** crear trigger similar a `enforce_installer_ticket_column_restrictions` pero para `key_authorizations`, que rechace cambios de installer a columnas que no debería tocar.

---

### 9. Funciones de negocio sin `search_path` seteado

**Archivos:** funciones en `sales.*` y `operations.*`.

**Situación:** los helpers de `identity.*` tienen `SET search_path = ''`. Las funciones de negocio, no. Vector de search-path attack teórico si alguien puede crear tablas en un schema anterior en el search_path.

**Fix:** agregar `SET search_path = ''` a las SECURITY DEFINER de business schemas y calificar todos los nombres de tabla dentro (`sales.bills` en vez de `bills`).

---

## 🟡 MEDIO

### 10. Interpolación de user input en filtro PostgREST

**Archivo:** `apps/admin/src/hooks/useOrdens.ts:67-69`

```typescript
query = query.or(`order_number.ilike.%${trimmed}%,particular_full_name.ilike.%${trimmed}%`);
```

PostgREST parsea, no ejecuta SQL raw, así que no es SQL injection. Pero `%`, `_`, `,`, `(`, `)` en el input pueden alterar el filtro. Bajo riesgo real por RLS, pero es higiene.

**Fix:** escapar caracteres especiales antes de interpolar. Auditar patrones similares en `useWorklist.ts` y `useAssignedTickets.ts`.

---

### 11. `console.warn` en producción con objetos de error crudos

**Archivos:** `apps/installer/src/hooks/useWorklist.ts`, `apps/installer/src/hooks/useAssignedTickets.ts`

**Riesgo:** errores de Supabase pueden leakear nombres de tablas/columnas al console del navegador.

**Fix:** envolver en `if (import.meta.env.DEV) { ... }` o mandar a un error tracker (Sentry) con filtro de PII.

---

### 12. Sin `Referrer-Policy`

**Archivos:** ambos `index.html`.

**Riesgo:** si un usuario está en `/ordenes/{uuid-sensible}` y clickea un link externo, la URL entera va en el header `Referer`.

**Fix:** agregar en el `<head>`:

```html
<meta name="referrer" content="strict-origin-when-cross-origin">
```

---

### 13. Timeout de profile fetch en 15s

**Archivo:** `packages/shared/src/auth/useAuth.ts:8-9`

15 segundos es mucho. Mala UX + oportunidad de DoS parcial.

**Fix:** bajarlo a 5-8s y agregar botón de "Reintentar" en el spinner.

---

## 🟢 BAJO / INFO

- **Sin audit log de eventos auth** (login/logout/role change). Recomendable para investigación post-incidente.
- **Sin SRI** en los `<script>` tags. Bajo riesgo con GitHub Pages sobre HTTPS. Mitigable con `vite-plugin-sri`.
- **Sin analytics ni trackers de terceros** — muy bien, menos superficie de ataque.
- **Deps modernas y mantenidas** — React 18.3, Vite 5.4, supabase-js 2.45.
- **Sin source maps en `dist/`** — verificado, OK.
- **Env vars validadas con Zod** al arranque — buena defensa contra misconfig.
- **RLS habilitada en las 18 tablas de negocio** con policies por rol. `anon` no tiene acceso a schemas sensibles. Esta capa está sólida.

---

## Fortalezas verificadas

1. **Staff provisioning enforced en servidor.** Las RLS policies exigen que el usuario exista en `identity.staff` con `status = 'active'`. No se puede bypassear en cliente.
   Ref: `supabase/migrations/20260808000013_auth_helpers.sql:49-53`

2. **Sin user enumeration.** Mensaje genérico "Email o contraseña incorrectos" para todos los fallos de login.
   Ref: `packages/shared/src/auth/useAuth.ts:174-176`

3. **`anon` sin acceso a schemas sensibles.** Grants revocados en `20260807000010`.

4. **Views con `security_invoker=true`** en `sales.pending_to_invoice` y `sales.administration_balance`. Ref: `20260808000017:20-27`.

5. **Statement timeouts configurados** por rol (auth: 10s, anon: 3s). Ref: `20260808000017:156-165`.

6. **Bill cancellation con payments bloqueado por trigger.** Ref: `20260808000017:37-58`.

7. **Immutable filename hashes** en el build de Vite — mitiga cache poisoning.

8. **React Strict Mode** habilitado en ambos apps.

---

## Plan de acción sugerido

### Antes de tocar producción

1. Bloquear el seed en prod (Crítico #1).
2. Agregar CSP + Referrer-Policy en ambos `index.html` (Crítico #2, Medio #12).
3. Verificar rate limiting en dashboard Supabase (Crítico #3).
4. Password `min(8)` y JWT expiry razonable (Alto #4, #7).

### Primera semana en prod

5. Idle timeout en cliente (Alto #7).
6. Column-level restriction para installer sobre `key_authorizations` (Alto #8).
7. Fix del scope del SW del installer si aplica (Alto #6).
8. Escaping en `.or()` filters (Medio #10).

### Backlog

9. `search_path` en business functions (Alto #9).
10. Wrap `console.warn` en `DEV` o mandar a error tracker (Medio #11).
11. Bajar timeout de profile fetch (Medio #13).
12. Audit log de auth, SRI, Sentry con filtro PII (Bajos).

---

## Pendiente (fuera de esta auditoría)

- **Capa 4 — Hosting / GitHub Pages:** headers HTTP disponibles (limitado en Pages), workflow de deploy, qué queda expuesto en `dist/`.
- **Capa 5 — Superficie general:** CORS, storage buckets, dependencias con CVEs (npm audit), pen-testing básico.
