# Delta for Installer Ticket Detail

**Change**: technical-installation-stock-lifecycle
**Date**: 2026-08-31

---

## MODIFIED Requirements

### Requirement: TWO_STEP_CATEGORIES in TicketCard Includes 'installation'

`TicketCard` MUST include `'installation'` in the `TWO_STEP_CATEGORIES` array. Previously this array contained only `'equipment_installation'` and `'equipment_replacement'`.

After this change:

```ts
const TWO_STEP_CATEGORIES = ['equipment_installation', 'equipment_replacement', 'installation']
```

When a ticket's `category` is `'installation'`, `TicketCard` MUST render the two-step configure/resolve affordance (not the plain batch-pool affordance). Concretely:

- The card MUST surface the configure step UI when `pending_new_serial` is not yet set.
- The card MUST surface the resolve step UI when `pending_new_serial` is set and the ticket is not yet resolved.
- The card MUST NOT be selectable for batch resolution via the "Marcar resueltos" batch toolbar when the ticket requires the two-step flow.

#### Scenario: TicketCard renders two-step affordance for installation ticket

- GIVEN a `support.tickets` row T with `category='installation'` assigned to the logged-in installer
- AND `T.pending_new_serial` is null (configure step not yet done)
- WHEN `TicketCard` renders T
- THEN the configure affordance is displayed (serial/model entry or link to configure flow)
- AND T is NOT selectable in the batch toolbar

#### Scenario: TicketCard renders resolve affordance for installation ticket after configure

- GIVEN a ticket T with `category='installation'` and `pending_new_serial` is already set
- WHEN `TicketCard` renders T
- THEN the resolve affordance is displayed
- AND T is NOT selectable in the batch toolbar (it must be resolved individually through the two-step flow)

#### Scenario: equipment_installation and equipment_replacement remain unchanged

- GIVEN a ticket T with `category='equipment_installation'`
- WHEN `TicketCard` renders T
- THEN the two-step affordance is rendered (behaviour unchanged)

---

### Requirement: TaskDetailPage ConfigureEquipmentInline Gate Includes 'installation'

`TaskDetailPage` MUST extend the `ConfigureEquipmentInline` category gate to include `'installation'`. The gate previously checked only for `'equipment_installation'` (via a constant such as `EQUIPMENT_INSTALLATION` or an explicit category comparison).

After this change, when `TaskDetailPage` receives a ticket with `category='installation'`, it MUST render `ConfigureEquipmentInline` with the same props and behaviour as for `equipment_installation`.

`ConfigureEquipmentInline` MUST:

- Accept `'installation'` in its TypeScript category prop type without raising a compile error.
- Call `public.configure_technical_ticket_equipment` when the installer submits the configure step.
- Call `public.resolve_ticket` when the installer submits the resolve step (providing serial, model, description, building_id, access_type, and note).

#### Scenario: TaskDetailPage renders ConfigureEquipmentInline for installation ticket

- GIVEN the installer navigates to the detail page of a ticket T with `category='installation'`
- WHEN `TaskDetailPage` renders
- THEN `ConfigureEquipmentInline` is rendered for T
- AND the installer sees the configure serial/model fields (or the resolve panel if already configured)

#### Scenario: ConfigureEquipmentInline configure step for installation ticket

- GIVEN `ConfigureEquipmentInline` is rendered for a ticket T with `category='installation'` and `pending_new_serial=null`
- WHEN the installer fills in serial and model and submits
- THEN `public.configure_technical_ticket_equipment(T.id, serial, model, actor_id)` is called
- AND on success, `T.pending_new_serial` and `T.pending_new_model` are populated
- AND the UI transitions to the resolve step

#### Scenario: ConfigureEquipmentInline resolve step for installation ticket

- GIVEN `ConfigureEquipmentInline` is rendered for a ticket T with `category='installation'` and `pending_new_serial` already set
- WHEN the installer fills in description, building, access_type, and optional note and resolves
- THEN `public.resolve_ticket(T.id, serial, model, description, building_id, access_type, note, actor_id)` is called
- AND on success the ticket is `resolved`
- AND `operations.equipment` contains a new row with the provided serial
- AND stock movements `egreso_instalacion` and `liberacion_reserva` are emitted (if `product_id` was set on the order item)
- AND `technical_order_items.intended_equipment_id` is updated to the new equipment UUID

#### Scenario: TypeScript compile — no type error for 'installation' category in ConfigureEquipmentInline

- GIVEN the component's category prop type is updated to include `'installation'`
- WHEN TypeScript compiles the installer app
- THEN no type error is raised when passing `category='installation'` to `ConfigureEquipmentInline`

## Key Learnings

1. `TicketCard` and `TaskDetailPage` are the two installer surfaces that need updating — the configure/resolve logic itself lives in the shared `ConfigureEquipmentInline` component, so the bulk of the behaviour comes for free by extending the gate.
2. The installer should NOT route `installation` tickets through the batch "Marcar resueltos" flow — those tickets require serial capture, which is not part of the batch flow.
3. `access_type` remains nullable and is entered by the installer at resolve time (not pre-configured by the admin), matching the existing `equipment_installation` flow — no `pending_access_type` column is added.
