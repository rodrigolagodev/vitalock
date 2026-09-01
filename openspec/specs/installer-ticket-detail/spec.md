# Installer Ticket Detail

**Changes**:
- technical-installation-stock-lifecycle (2026-08-31)
- ticket-taxonomy-cleanup (2026-09-01)

---

## MODIFIED Requirements

### Requirement: TWO_STEP_CATEGORIES in TicketCard (Installer) — Collapsed

`TicketCard` in the installer app MUST update `TWO_STEP_CATEGORIES` to reference the new category names:

```ts
const TWO_STEP_CATEGORIES = ['install_equipment', 'replace_equipment']
```

When a ticket's `category` is `'install_equipment'` or `'replace_equipment'`, `TicketCard` MUST render the two-step configure/resolve affordance and the card MUST NOT be selectable for batch resolution.

#### Scenario: TicketCard renders two-step affordance for install_equipment ticket

- GIVEN a `support.tickets` row T with `category='install_equipment'` assigned to the logged-in installer
- AND `T.pending_new_serial` is null
- WHEN `TicketCard` renders T
- THEN the configure affordance is displayed
- AND T is NOT selectable in the batch toolbar

#### Scenario: TicketCard renders batch-eligible affordance for maintain_equipment ticket

- GIVEN a ticket T with `category='maintain_equipment'`
- WHEN `TicketCard` renders T
- THEN T is selectable in the batch toolbar

### Requirement: TaskDetailPage ConfigureEquipmentInline Gate Uses install_equipment

`TaskDetailPage` MUST extend the `ConfigureEquipmentInline` gate to use `'install_equipment'` (and `'replace_equipment'`). `ConfigureEquipmentInline` MUST accept both values in its TypeScript category prop type.

#### Scenario: TaskDetailPage renders ConfigureEquipmentInline for install_equipment ticket

- GIVEN the installer navigates to the detail page of a ticket T with `category='install_equipment'`
- WHEN `TaskDetailPage` renders
- THEN `ConfigureEquipmentInline` is rendered for T

### Requirement: AssignEquipmentDialog modeForCategory Switch Uses New Names

`AssignEquipmentDialog.modeForCategory()` MUST reference `'install_equipment'` and `'replace_equipment'`. The two former branches for `'installation'` and `'equipment_installation'` MUST collapse into a single `'install_equipment'` branch.

#### Scenario: modeForCategory returns correct mode for install_equipment

- GIVEN the updated switch is deployed
- WHEN `modeForCategory('install_equipment')` is called
- THEN it returns the same mode previously returned for `'equipment_installation'`

### Requirement: EXCLUDED_FOR_BATCH in TicketsSection (Installer) Uses update_equipment

`TicketsSection` MUST update `EXCLUDED_FOR_BATCH` to reference `'update_equipment'` instead of `'equipment_update'`.

#### Scenario: update_equipment tickets are excluded from batch resolve

- GIVEN a list of installer tickets including one with `category='update_equipment'`
- WHEN `TicketsSection` renders the batch resolve toolbar
- THEN the `update_equipment` ticket is NOT included in the selectable batch pool
