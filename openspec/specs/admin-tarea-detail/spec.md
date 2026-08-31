# Delta for Admin Tarea Detail

**Change**: technical-installation-stock-lifecycle
**Date**: 2026-08-31

---

## MODIFIED Requirements

### Requirement: CATEGORIES_TWO_STEP_CONFIGURE Includes 'installation'

`TareaDetailPage` MUST include `'installation'` in the `CATEGORIES_TWO_STEP_CONFIGURE` set. Previously this set contained only `'equipment_installation'` and `'equipment_replacement'`.

After this change:

```ts
const CATEGORIES_TWO_STEP_CONFIGURE = new Set([
  'equipment_installation',
  'equipment_replacement',
  'installation',
])
```

When a ticket's `support.tickets.category` is `'installation'`, `TareaDetailPage` MUST render `ConfigureEquipmentPanel` (the two-step configure/resolve panel) instead of `AssignEquipmentDialog` in `create` mode.

The previous fallback path via `AssignEquipmentDialog` (`createAndAssignEquipment` RPC) MUST NOT be invoked for `installation` tickets once this change is applied, because that path:
- Links `tickets.equipment_id` but never writes `technical_order_items.intended_equipment_id`.
- Does not emit stock movements.
- Does not resolve the ticket through the correct state machine.

#### Scenario: TareaDetailPage renders ConfigureEquipmentPanel for installation ticket

- GIVEN a `support.tickets` row T with `category='installation'` is open
- WHEN an admin opens the tarea detail view for T
- THEN `ConfigureEquipmentPanel` is rendered
- AND `AssignEquipmentDialog` in `create` mode is NOT rendered

#### Scenario: TareaDetailPage still renders ConfigureEquipmentPanel for equipment_installation

- GIVEN a `support.tickets` row T with `category='equipment_installation'`
- WHEN an admin opens the tarea detail view for T
- THEN `ConfigureEquipmentPanel` is rendered (behaviour unchanged)

#### Scenario: TareaDetailPage uses AssignEquipmentDialog for non-two-step categories

- GIVEN a `support.tickets` row T with `category='maintenance'`
- WHEN an admin opens the tarea detail view for T
- THEN `ConfigureEquipmentPanel` is NOT rendered (behaviour unchanged for non-two-step categories)

---

### Requirement: ConfigureEquipmentPanel Accepts and Displays 'installation' Category

`ConfigureEquipmentPanel` MUST accept `'installation'` in its TypeScript category union type (wherever `'equipment_installation' | 'equipment_replacement'` is currently used). The component MUST also include `'installation'` in its heading and help-copy maps so that it renders appropriate labels when the ticket category is `'installation'`.

Functionally the panel MUST behave identically to its `equipment_installation` path: it captures serial and model, calls `configure_technical_ticket_equipment`, and surfaces a resolve button that calls `resolve_ticket`.

#### Scenario: ConfigureEquipmentPanel renders with correct heading for installation ticket

- GIVEN a ticket T with `category='installation'`
- WHEN `ConfigureEquipmentPanel` renders with T
- THEN the panel heading reflects the installation category (e.g. "Configurar equipo a instalar")
- AND the serial and model fields are displayed

#### Scenario: ConfigureEquipmentPanel calls configure RPC for installation ticket

- GIVEN a ticket T with `category='installation'` rendered in `ConfigureEquipmentPanel`
- WHEN the admin fills in serial and model and submits the configure step
- THEN `public.configure_technical_ticket_equipment(T.id, serial, model, actor_id)` is called
- AND on success, `T.pending_new_serial` and `T.pending_new_model` are populated

#### Scenario: ConfigureEquipmentPanel TypeScript union does not raise a compile error for 'installation'

- GIVEN the component's prop type for `category` is updated to include `'installation'`
- WHEN TypeScript compiles the admin app
- THEN no type error is raised when passing `category='installation'` to `ConfigureEquipmentPanel`

## Key Learnings

1. The `AssignEquipmentDialog` / `createAndAssignEquipment` fallback path is a distinct bug from missing stock movements: it links `tickets.equipment_id` but not `technical_order_items.intended_equipment_id`. Removing it from the `installation` path is intentional and correct.
2. `ConfigureEquipmentPanel` heading/help copy maps must be extended — failing to add `'installation'` there would cause the panel to render with missing or incorrect labels even if the category gate passes.
3. No new RPC is introduced in the admin UI. Both configure and resolve calls for `installation` tickets route through the same RPCs as `equipment_installation`.
