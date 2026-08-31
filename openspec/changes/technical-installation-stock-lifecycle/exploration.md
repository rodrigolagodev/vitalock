# Exploration: technical-installation-stock-lifecycle

## Current State

**Schema (baseline `supabase/migrations/20260831000000_baseline.sql`)**

- `public.technical_order_items` (L5405): `product_id`, `intended_equipment_id`, `intended_replacement_equipment_id`, `intended_assignee_staff_id`, `building_id NOT NULL`, `status` CHECK (`pending|in_progress|completed|cancelled`), `item_type` CHECK (`equipment|maintenance|installation|equipment_replacement`). Intent columns immutable once order leaves `draft` (trigger `technical_order_items_intent_immutable`, L3534).
- `support.tickets` (L5803): `category` CHECK includes `installation`, `equipment_installation`, `equipment_replacement`, `equipment_update`, `key_configuration`, `key_installation`, `maintenance`. Fields `pending_new_serial`, `pending_new_model`, `technical_order_item_id`.
- `public.products` (L5348): `stock_total`, `stock_reservado`. CHECKs: `stock_reservado <= stock_total`, both `>= 0`. No `stock_disponible` column.
- `public.stock_movements` (L5379): `quantity <> 0`, sign-matches-type, `order_kind` required when order_id/order_item_id is set. Counter maintenance via trigger `stock_movements_maintain_counters`.
- `operations.equipment` (L4952): `serial_number`, `building_id`, `installed_at` immutable. `description NOT NULL`. `access_type` nullable.

**Root cause — category mapping gap in `confirm_technical_order` (L1335-1341):**

```sql
v_category := case v_item.item_type
  when 'installation'          then 'installation'
  when 'equipment_replacement' then 'equipment_replacement'
  when 'maintenance'           then 'maintenance'
  when 'equipment'             then 'equipment_installation'
end;
```

`item_type='installation'` maps to `category='installation'` — NOT `equipment_installation`. Excludes the ticket from every downstream side-effect:

- **Reservation** (L1380-1401): gated on `v_item.product_id IS NOT NULL`. Installation items never carry `product_id` (form returns `null`, TechnicalOrderForm L673-675). No reserva emitted.
- **Configure equipment** (`configure_technical_ticket_equipment` L1114-1118): explicit guard `category IN ('equipment_installation', 'equipment_replacement')`. 'installation' rejected.
- **Resolve side-effects** (`resolve_ticket` L3022): `if v_ticket.category in ('equipment_installation', 'equipment_replacement')` — 'installation' bypasses equipment creation, `egreso_instalacion`, `liberacion_reserva`.
- **Neither resolve path writes back `technical_order_items.intended_equipment_id`.** `resolve_ticket` updates `support.tickets.equipment_id` (L3079); item row stays untouched.

**Admin UI**
- `TechnicalOrderForm`: `TechnicalItemEquipmentField` returns `null` for `itemType === 'installation'` (L673-675). No product_id field, no intended_equipment_id field.
- `TareaDetailPage` (L25-28): `CATEGORIES_TWO_STEP_CONFIGURE = new Set(['equipment_installation', 'equipment_replacement'])`. 'installation' excluded → no `ConfigureEquipmentPanel`. Shows `AssignEquipmentDialog` in `create` mode instead → `createAndAssignEquipment` RPC creates the equipment row and links `tickets.equipment_id` but does NOT resolve, does NOT emit stock movements, does NOT write `technical_order_items.intended_equipment_id`.

**Installer UI**
- `TicketCard.tsx` (L28-31): `TWO_STEP_CATEGORIES = ['equipment_installation', 'equipment_replacement']`. 'installation' → plain batch-selectable pool; installer resolves without serial config.
- `TaskDetailPage.tsx` (L36): `EQUIPMENT_INSTALLATION` constant not extended to 'installation'.

**Tests**
- No pgTAP tests in repo.
- Vitest covers `ConfigureEquipmentPanel`, `ConfigureEquipmentInline`, `useConfigureTechnicalTicketEquipment` — only for `equipment_installation`/`equipment_replacement`.
- No coverage for 'installation' category or stock reservation paths.

## Affected Areas

- `supabase/migrations/*` — new delta migration
- `apps/admin/src/components/servicio-tecnico/TechnicalOrderForm.tsx` — add product_id field for 'installation'
- `apps/admin/src/routes/tareas/TareaDetailPage.tsx` — include 'installation' in CATEGORIES_TWO_STEP_CONFIGURE
- `apps/admin/src/components/tareas/ConfigureEquipmentPanel.tsx` — extend category union + labels
- `apps/installer/src/components/work/TicketCard.tsx` — include 'installation' in TWO_STEP_CATEGORIES
- `apps/installer/src/routes/TaskDetailPage.tsx` — extend ConfigureEquipmentInline gate

## Chosen Approach — Flujo A (user-confirmed)

Extend the existing `equipment_installation` two-step path to also cover `installation`. Delta:

1. **SQL migration**:
   - Extend `configure_technical_ticket_equipment` guard to include `'installation'`.
   - Extend `resolve_ticket` side-effect block to include `'installation'` with identical equipment creation + stock movement logic as `equipment_installation`.
   - After equipment INSERT for 'installation', UPDATE `technical_order_items.intended_equipment_id` using a new `set_config` bypass pattern (mirrors the existing `app.allow_installer_equipment_swap`).
   - `confirm_technical_order` already emits `reserva` when `product_id IS NOT NULL` → no RPC change; only the form must supply `product_id`.

2. **Admin form**: `product_id` selector for 'installation' (filtered to `equipment` category products); zod schema requires it; `TechnicalItemEquipmentField` renders for 'installation'.

3. **Admin tarea detail**: add 'installation' to `CATEGORIES_TWO_STEP_CONFIGURE`; extend `ConfigureEquipmentPanel` typing + heading/help maps.

4. **Installer**: add 'installation' to `TWO_STEP_CATEGORIES` and gate for `ConfigureEquipmentInline`.

## Risks

- **Intent-immutable trigger has no bypass for `intended_equipment_id`** (L3534). New `set_config` bypass variable (e.g. `app.allow_resolve_equipment_id_write`) must be added to BOTH the trigger and `resolve_ticket`.
- **`access_type`**: Flujo A RPC signature includes `p_access_type`. `support.tickets` has no `pending_access_type` column. Options: (a) add column; (b) keep access_type nullable and let installer type it on resolve panel (already supported by `ConfigureEquipmentInline`). **(b) is simpler and matches existing `equipment_installation` flow.**
- **No DB test infrastructure**: pgTAP setup does not exist. Vitest mocks cover UI only.
- **Existing 'installation' tickets in production**: Any already-resolved 'installation' ticket with no serial must not break. New logic is idempotent on new inserts; legacy rows retain their historical state.

## Key Learnings

1. `item_type='installation'` → `category='installation'` mapping (not `equipment_installation`) is the single root cause of all 4 bugs.
2. `configure_technical_ticket_equipment` hard-gates on `category IN ('equipment_installation', 'equipment_replacement')`; extending this gate is the minimum SQL change.
3. Stock reservation at confirm is conditional on `product_id IS NOT NULL` — installation items never carry `product_id` from the current form.
4. `technical_order_items_intent_immutable` trigger has no `set_config` bypass; adding one is required to write `intended_equipment_id` at resolve time.
5. Both resolve paths (`resolve_ticket`, `resolve_equipment_installation`) already do the right thing for `equipment_installation`; extending the guard to include `installation` mirrors the pattern with minimal delta.

## Ready for Proposal

Yes. Scope clear, model confirmed, integration points identified.
