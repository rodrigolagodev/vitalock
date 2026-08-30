# SDD Explore: logic-consolidation-shared-hooks-and-postgres

## Current State

Vitalock is a pnpm+Turbo monorepo with two React apps (`admin`, `installer`) and five shared packages. Business logic is split between Postgres RPCs and the browser. Exploration confirmed two distinct defect classes:

1. **Cross-app hook duplication** — identical or near-identical logic in both `apps/admin/src/hooks/` and `apps/installer/src/hooks/` with no shared extraction point.
2. **Browser-orchestrated operations that belong in Postgres** — sequential multi-query patterns, non-atomic multi-writes, and client-side post-processing.

---

## Frente 1: Duplicated Hook Inventory

### A. `mapMutationError.ts` — True duplicate, diverged coverage

| Attribute | admin | installer |
|---|---|---|
| Path | `apps/admin/src/hooks/mapMutationError.ts` | `apps/installer/src/hooks/mapMutationError.ts` |
| LOC | 106 | 36 |
| SQLSTATE cases | 23505, 23514, 23503, 42501, P0001 | 23514, 42501 |
| Callers | 60 hooks | 13 hooks |
| Test file | Yes | Yes |
| Shared primitives | `isNetworkError`, `isPostgrestError` from `@vitalock/shared` | Same |

Installer version is a strict subset. Core error-classification is identical. Divergence is only in message strings and SQLSTATE coverage. Infrastructure lives in `packages/shared/src/errors/parseSupabaseError.ts`.

**Category: (a) true duplicate → extract.** Move skeleton to `packages/shared/src/errors/toastMutationError.ts`. Each app provides an `extraHandlers` map for app-scoped messages.

### B. `useConfigureTechnicalTicketEquipment` — Shared shell + app-specific context

| Attribute | admin | installer |
|---|---|---|
| RPC | `configureTechnicalTicketEquipment` from `@vitalock/supabase` | Same |
| Input type | `ConfigureTechnicalTicketEquipmentInput` | Same |
| `onSuccess` invalidation | `tareasKey()` + `['admin', 'tarea', vars.ticketId]` | `assignedTicketsKey(staffId)` |
| `staffId` source | Not used | `useAuthContext().staff.id` |
| Toast copy | `'Equipo configurado. Falta finalizar la tarea.'` | `'Equipo configurado. Marcá la tarea para finalizarla.'` |

`mutationFn` is byte-for-byte identical. Only `onSuccess` and toast differ.

**Category: (b) shared shell + app-specific context → extract with config.** A factory `createUseConfigureTechnicalTicketEquipment(options)` in `packages/shared` eliminates the duplicate.

### C. `useKeyOrders` vs `useTechnicalOrders` — Intra-admin twins

Both in `apps/admin/src/hooks/`. Identical structure: N+1 buildingId filter, identical client-side company_name filter, identical ILIKE pattern. Table names differ (`key_orders`/`key_order_items` vs `technical_orders`/`technical_order_items`). Installer has no counterparts.

**Category: (b) shared shell + domain config → extract.** Lower priority (intra-app only).

### D. `useAssignedTickets` + `useTicketHistory` (installer) — Cross-schema stitching

Both implement the same 3-step batch stitching:
1. Fetch `support.tickets` flat (no cross-schema embed)
2. Batch-fetch `public.buildings` via `.in('id', buildingIds)`
3. Batch-fetch `public.administrations` via `.in('id', administrationIds)`

Code comment in `useAssignedTickets`: `// PostgREST cannot embed cross-schema FKs (support -> public)... An embed like building:building_id(...) fails with PGRST200.`

`useAssignedTickets` adds equipment_update snapshots and product names (up to 5 queries total).

**Category: (b) shared stitching infra + different result shapes.** Best server-side fix: a Postgres view collapsing the joins. Highest-value Frente 2 item for installer.

### E. Remaining installer hooks (`useResolveTickets`, `useCompleteAuthorizations`, `useRejectAuthorization`, `useAddComment`, `useResolveEquipmentUpdate`)

Use local `mapMutationError` + `useAuthContext`. No admin counterparts.

**Category: (c) legitimately different → leave.**

---

## Frente 2: Browser Orchestration Anti-Patterns

### AP-1: Non-atomic write — `createAndAssignEquipment`

**File**: `apps/admin/src/hooks/useMutateTicketEquipment.ts:64-85`

```
Request 1: INSERT operations.equipment (…) → returns equipment.id
Request 2: UPDATE support.tickets SET equipment_id = created.id WHERE id = ticketId
```

Between requests: no rollback. If request 2 fails, equipment row is orphaned. Code comment acknowledges this is retained for the generic `installation` category only (equipment_installation and equipment_replacement use atomic RPCs).

**Single caller**: `AssignEquipmentDialog.tsx` (no covering tests).

**Remediation**: RPC `public.create_and_assign_equipment(p_ticket_id, p_building_id, p_serial, p_model, p_description, p_access_type) RETURNS uuid`. One transaction.

### AP-2: N+1 buildingId filter — `useKeyOrders` and `useTechnicalOrders`

**Files**: `apps/admin/src/hooks/useKeyOrders.ts:46-57`, `apps/admin/src/hooks/useTechnicalOrders.ts:44-55`

Two-query pattern fires on every filter change.

**Remediation**: View `public.key_orders_summary` / `public.technical_orders_summary` with JOIN on items table. PostgREST filters on `items.building_id` via embed. Zero migration risk (additive).

### AP-3: Client-side `company_name` filter

**Files**: `apps/admin/src/hooks/useKeyOrders.ts:100-108`, `apps/admin/src/hooks/useTechnicalOrders.ts:98-106`

Server cannot apply the filter because PostgREST `.or()` doesn't reach embedded columns. Every admin-search fetches ALL admin-type orders and discards non-matches in JS.

**Remediation**: View with `JOIN administrations` exposing `company_name` as first-class column, plus `pg_trgm` GIN index for ILIKE performance.

### AP-4: Non-atomic batch write — `useCompleteAuthorizations`

**File**: `apps/installer/src/hooks/useCompleteAuthorizations.ts:23-50`

Two sequential UPDATEs. If second fails, `installIds` are already committed as `installed`. Partial completion, no rollback.

**Remediation**: RPC `public.complete_authorizations(p_install_ids, p_remove_ids, p_staff_id, p_timestamp)` wrapping both UPDATEs in one transaction.

### AP-5: Cross-schema JS stitching — `useAssignedTickets`, `useTicketHistory`

3-4 sequential queries per request due to PGRST200 limit on `support → public`. `useAssignedTickets` runs up to 5.

**Remediation**: View or SECURITY DEFINER function joining `support.tickets` + `public.buildings` + `public.administrations`. Reduces to 1 query.

### AP-6: Two-step sequential read — `useTechnicalOrderTickets`

**File**: `apps/admin/src/hooks/useTechnicalOrderTickets.ts:41-64`

Same cross-schema limitation. A view or enriched query eliminates the extra round-trip.

---

## RPC Contract Inventory

| File | Used by admin | Used by installer |
|---|---|---|
| `keyOrders.ts` (7 RPCs) | Yes | No |
| `technicalOrders.ts` (6 RPCs) | Yes | No |
| `tickets.ts` (4 RPCs) | Yes | Yes |
| `resolveEquipmentUpdate.ts` | No | Yes |
| `requestKeyDisable.ts` | Yes | No |
| `cancelKeyDisable.ts` | Yes | No |
| `createEquipmentUpdate.ts` | Yes | No |

Only `tickets.ts` spans both apps. New `create_and_assign_equipment` and `complete_authorizations` wrappers go there.

---

## Cross-Schema Patterns

| FK Direction | PostgREST embed | Status |
|---|---|---|
| operations → public | Works | useWorklist uses try/fallback |
| support → public | PGRST200 failure | Forces JS stitching (3 hooks) |
| support → operations | Not attempted | — |
| identity.staff | Direct query, no embed | useStaffByIds uses `.in()` |

**View vs RPC matrix:**

| Anti-pattern | Best fix | Reason |
|---|---|---|
| AP-1 create+assign | RPC | Write + atomicity |
| AP-2 N+1 buildingId | View | Read-only, additive |
| AP-3 company_name filter | View with join | Read-only, enables PostgREST filter |
| AP-4 auth batch | RPC | Write + atomicity |
| AP-5 cross-schema stitching | View (SECURITY DEFINER) | Read-only, eliminates waterfall |
| AP-6 two-step tickets read | View | Read-only |

---

## Risk Map

| Item | RLS impact | Test impact | TypeGen regen | Rollback |
|---|---|---|---|---|
| Extract `mapMutationError` | None | Migrate 2 test files | No | Low |
| Extract `useConfigureTechnicalTicketEquipment` factory | None | Update mocks | No | Low |
| RPC `create_and_assign_equipment` | Must allow RPC caller INSERT + UPDATE | No existing test — write one first | Yes | Medium |
| Views for N+1 / company_name | Inherits table RLS | Update 2 hook tests | Yes | Low |
| RPC `complete_authorizations` | Must satisfy UPDATE RLS | No existing test — write one first | Yes | Medium |
| Cross-schema view | SECURITY DEFINER vs INVOKER decision | Update `useAssignedTickets.test.ts` | Yes | Medium |

---

## Approaches

**Approach 1 (Recommended): Incremental, frente-by-frente**
Extract `mapMutationError` + `useConfigureTechnicalTicketEquipment` first (no migration, no typegen). Then add RPCs/views in separate PRs.
- Pros: Independently reviewable, low blast radius per slice
- Cons: 3-4 PRs total
- Effort: Medium

**Approach 2: All client-side only**
Extract shared hooks. Leave Postgres anti-patterns.
- Pros: Zero migration risk
- Cons: Leaves data integrity hole (AP-1) and debt
- Effort: Low

**Approach 3: All at once**
Extract hooks + all RPCs/views in one PR.
- Pros: Single coherent change
- Cons: 600-800 LOC review burden, mixes TS + migration bugs
- Effort: High

**Recommendation**: Approach 1, prioritizing AP-1 alongside `mapMutationError` extraction. AP-2/AP-3 and AP-5 are separate PRs due to typegen and view migrations.

---

## Affected Areas

- `apps/admin/src/hooks/mapMutationError.ts` → extract + update import
- `apps/installer/src/hooks/mapMutationError.ts` → extract + update import
- `apps/admin/src/hooks/useConfigureTechnicalTicketEquipment.ts` → factory call
- `apps/installer/src/hooks/useConfigureTechnicalTicketEquipment.ts` → factory call
- `apps/admin/src/hooks/useMutateTicketEquipment.ts` → new RPC
- `apps/admin/src/hooks/useKeyOrders.ts` → view + typegen
- `apps/admin/src/hooks/useTechnicalOrders.ts` → view + typegen
- `apps/installer/src/hooks/useCompleteAuthorizations.ts` → new RPC
- `apps/installer/src/hooks/useAssignedTickets.ts` → cross-schema view
- `apps/installer/src/hooks/useTicketHistory.ts` → cross-schema view
- `packages/shared/src/errors/` → new `toastMutationError.ts`
- `packages/supabase/src/rpc/tickets.ts` → new RPC wrappers
- `packages/supabase/src/database.types.ts` → regen
- `supabase/migrations/` → new RPCs and views

---

## Ready for Proposal

Yes. Evidence is complete for all 6 anti-patterns and 4 hook duplication candidates. Proposal should scope at least two deliverable slices: (1) shared hooks TS-only, (2) Postgres-first RPCs + views.
