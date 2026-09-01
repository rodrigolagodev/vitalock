# Exploration: ticket-taxonomy-cleanup

## Current State

`support.tickets.category` CHECK allows 7 values:
`maintenance | installation | key_configuration | key_installation | equipment_installation | equipment_replacement | equipment_update`

`technical_order_items.item_type` CHECK allows 4 values:
`equipment | maintenance | installation | equipment_replacement`

**Live DB snapshot** (`lhzvvcmqjlsrfgchlvry`): 2 rows total in `support.tickets`, both `category='installation'`, `status='resolved'`. Zero rows for `key_configuration` and `key_installation`.

## Impact Inventory

### SQL — `supabase/migrations/20260831000000_baseline.sql`

| Line(s) | Symbol | Categories | Context |
|---|---|---|---|
| 5829 | `tickets_category_check` CHECK | All 7 | Table DDL |
| 5420 | `technical_order_items_item_type_check` CHECK | equipment, maintenance, installation, equipment_replacement | Table DDL |
| 1114 | `configure_technical_ticket_equipment` | equipment_installation, equipment_replacement | Guard (superseded by 2026-09-01 delta) |
| 1295–1341 | `confirm_technical_order` | item_type: 4 values → CASE map to categories | Loop over items |
| 1887–1888 | `add_technical_order_item` | item_type validation | Standalone RPC |
| 2550, 2680, 2823 | `resolve_equipment_installation` / `_replacement` / `_update` | Internal guards | Called by admin/installer |
| 3022, 3058 | `resolve_ticket` | equipment_installation, equipment_replacement | Superseded by 2026-09-01 delta |
| 4635 | ticket triggers | maintenance | Assignment routing |
| 4732 | `tickets_block_equipment_update_cancel_in_progress` | equipment_update | Trigger |
| 4748 | `tickets_reject_key_installation_inserts` | key_installation | Trigger — DROP after removing from CHECK |
| 4766 | `tickets_require_equipment_on_resolve` | 5 technical categories | Trigger |
| **4867** | `tickets_validate` | **`category IS IMMUTABLE`** | **CRITICAL: blocks all UPDATE SET category** |
| 5841 | column COMMENT | equipment_installation, equipment_replacement | Docs |

### SQL — `supabase/migrations/20260901120000_extend_installation_category_lifecycle.sql`

Both `configure_technical_ticket_equipment` and `resolve_ticket` will be **replaced wholesale** in the new delta (with the new category names).

### Views

`support.installer_tickets_with_context`, `support.technical_order_tickets` — pass `category` through, no filtering. No change needed.

### Admin app (`apps/admin/src`)

| File | Symbol | Categories referenced |
|---|---|---|
| `hooks/useTareas.ts:9-14` | `TareaRow.category` union | maintenance, installation, key_configuration, equipment_installation, equipment_replacement |
| `components/tareas/TareaFormSheet.tsx:97,168,207,237` | `CATEGORY_LABELS`, `CREATE_CATEGORY_LABELS`, defaults | All 7 in labels; maintenance + installation in standalone create |
| `components/tareas/TareasTable.tsx:14-21` | `CATEGORY_LABELS` | All 7 |
| `routes/tareas/TareaDetailPage.tsx:25-45` | 4 sets/maps: `CATEGORIES_TWO_STEP_CONFIGURE`, `CATEGORY_LABELS`, `CATEGORIES_REQUIRING_EQUIPMENT`, `ASSIGN_BUTTON_LABEL` | All |
| `components/tareas/AssignEquipmentDialog.tsx:71-83,155,302` | `modeForCategory()` switch, `onCreateSubmit` conditional | maintenance/installation/equipment_installation/equipment_replacement |
| `routes/equipos/EquipoDetailPage.tsx:21` | `ITEM_TYPE_LABEL` | equipment_replacement |
| `components/servicio-tecnico/TechnicalOrderForm.tsx:34-38` | `ITEM_TYPES` tuple, labels, zod enum, superRefine | 4 item_types |
| `components/servicio-tecnico/TechnicalOrderItemsTable.tsx:24` | `ITEM_TYPE_LABELS` | 4 item_types |

### Installer app (`apps/installer/src`)

| File | Symbol | Categories |
|---|---|---|
| `routes/TaskDetailPage.tsx:27-45` | `categorySubtitle`, constants, `GENERIC_RESOLVE_CATEGORIES` | All (includes 'installation') |
| `components/work/TicketCard.tsx:28-32` | `TWO_STEP_CATEGORIES` | equipment_installation, equipment_replacement, installation |
| `components/work/TicketsSection.tsx:30` | `EXCLUDED_FOR_BATCH` | equipment_update |

### Test files (15)

Tests referencing category string literals in admin + installer:
- `apps/admin/src/hooks/__tests__/useConfigureTechnicalTicketEquipment.test.ts`
- `apps/admin/src/hooks/__tests__/useTechnicalOrderTickets.test.ts`
- `apps/admin/src/components/tareas/__tests__/ConfigureEquipmentPanel.test.tsx`
- `apps/admin/src/components/tareas/__tests__/TareasTable.test.tsx`
- `apps/admin/src/components/servicio-tecnico/__tests__/TechnicalOrderForm.test.tsx`
- `apps/admin/src/components/servicio-tecnico/__tests__/LinkedTicketsTable.test.tsx`
- `apps/admin/src/components/servicio-tecnico/__tests__/TechnicalOrderItemsTable.test.tsx`
- `apps/installer/src/hooks/__tests__/useConfigureTechnicalTicketEquipment.test.ts`
- `apps/installer/src/hooks/__tests__/useTicketHistory.test.ts`
- `apps/installer/src/hooks/__tests__/useAssignedTickets.test.ts`
- `apps/installer/src/routes/__tests__/TaskDetailPage.test.tsx`
- `apps/installer/src/routes/__tests__/TareasPage.test.tsx`
- `apps/installer/src/routes/__tests__/HistorialPage.test.tsx`
- `apps/installer/src/components/work/__tests__/ConfigureEquipmentInline.test.tsx`
- `apps/installer/src/components/work/__tests__/EquipmentUpdateResolveDetail.test.tsx`

## `technical_order_items.item_type` Collapse

Current CASE mapping in `confirm_technical_order`:
```
equipment              → equipment_installation
installation           → installation
equipment_replacement  → equipment_replacement
maintenance            → maintenance
```

**Decision (from reform proposal)**: `equipment` and `installation` both create install tickets → collapse into ONE item_type `install_equipment`. Final mapping becomes 1-a-1:
```
install_equipment      → install_equipment
replace_equipment      → replace_equipment
maintain_equipment     → maintain_equipment
```

The CASE mapping in `confirm_technical_order` becomes trivial (identity).

## Data Migration Plan

**Blocker**: `tickets.category IS IMMUTABLE` (trigger `tickets_validate`, baseline L4867). Plain UPDATE raises. Migration must temporarily disable triggers OR use SECURITY DEFINER bypass.

**Simpler approach**: `ALTER TABLE support.tickets DISABLE TRIGGER ALL;` inside a transaction, run UPDATE, `ENABLE TRIGGER ALL;`, then swap CHECK.

```sql
-- 1. Pre-migration counts (RAISE NOTICE)
-- 2. DISABLE TRIGGER ALL on support.tickets
-- 3. UPDATE renames:
--    installation, equipment_installation  → install_equipment
--    equipment_replacement                 → replace_equipment
--    equipment_update                      → update_equipment
--    maintenance                           → maintain_equipment
--    (key_configuration, key_installation: 0 rows, no-op)
-- 4. ENABLE TRIGGER ALL
-- 5. DROP CONSTRAINT tickets_category_check; ADD new CHECK with 4 values
-- 6. Post-migration assertion (all rows in valid set)
-- 7. Same for technical_order_items.item_type (no immutability trigger there)
-- 8. DROP tickets_reject_key_installation_inserts (obsolete)
-- 9. Update tickets_require_equipment_on_resolve trigger body (new names)
-- 10. Update tickets_block_equipment_update_cancel_in_progress (new name)
```

Zero data loss expected. The 2 live tickets become `install_equipment`.

## `TareaFormSheet` Standalone Constraint

Per reform spec: only `maintain_equipment` should be creatable standalone (installation requires product_id which comes from an order).

Changes: `CREATE_CATEGORY_LABELS = { maintain_equipment: 'Mantenimiento' }`, default value `'maintain_equipment'`, drop `installation` from create path.

## Risks

1. **Immutability trigger blocks migration** — mitigated by DISABLE/ENABLE TRIGGER pattern inside the migration transaction.
2. **`item_type` collapse assumption** — `equipment` and `installation` merge into one item_type. Any business reporting that distinguished them will need to be reviewed (none found in exploration).
3. **`resolve_equipment_installation` RPC name** stays but internal guard changes to `install_equipment`. Callers use the function name, not the string.
4. **`AssignEquipmentDialog` simplification** — the `case 'installation'` and `case 'equipment_installation'` collapse into one path; the conditional `if (category === 'equipment_installation')` becomes `if (category === 'install_equipment')`. Net simplification.

## Ready for Proposal

Yes. Impact surface is bounded and enumerated. Data migration plan is clear. Only one open question (item_type collapse) already resolved by reform decision.

## Key Learnings

1. `tickets.category IS IMMUTABLE` (trigger `tickets_validate` at baseline L4867) blocks plain `UPDATE SET category`; the data migration must temporarily disable triggers on `support.tickets`.
2. The `item_type` enum on `technical_order_items` can collapse from 4 to 3 values, making the `confirm_technical_order` CASE mapping trivial (1-a-1).
3. Both baseline and the recent installation-lifecycle delta redefine the same functions (`configure_technical_ticket_equipment`, `resolve_ticket`) — the new delta must supersede both wholesale.
4. Zero rows exist for `key_configuration` and `key_installation` in production, so dropping them from the CHECK is safe with no data migration cost.
5. Fifteen test files reference category string literals; rename must be systematic across the monorepo to keep the suite green.
