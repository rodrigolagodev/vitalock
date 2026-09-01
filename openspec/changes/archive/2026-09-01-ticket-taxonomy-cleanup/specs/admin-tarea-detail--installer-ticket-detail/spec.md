# Delta for Admin Tarea Detail and Installer Ticket Detail

**Change**: ticket-taxonomy-cleanup

**Supersedes**:
- openspec/specs/admin-tarea-detail/spec.md (technical-installation-stock-lifecycle)
- openspec/specs/installer-ticket-detail/spec.md (technical-installation-stock-lifecycle)

## MODIFIED Requirements

### Requirement: CATEGORIES_TWO_STEP_CONFIGURE in TareaDetailPage — Collapsed to Two Values

`TareaDetailPage` MUST update `CATEGORIES_TWO_STEP_CONFIGURE` to reference the new category names. The prior value was:

```ts
const CATEGORIES_TWO_STEP_CONFIGURE = new Set([
  'equipment_installation',
  'equipment_replacement',
  'installation',
])
```

After this change it MUST be:

```ts
const CATEGORIES_TWO_STEP_CONFIGURE = new Set([
  'install_equipment',
  'replace_equipment',
])
```

`'installation'` and `'equipment_installation'` are fused into `'install_equipment'`. `'equipment_replacement'` becomes `'replace_equipment'`. The set shrinks from three values to two.

#### Scenario: TareaDetailPage renders ConfigureEquipmentPanel for install_equipment ticket

- GIVEN a `support.tickets` row T with `category='install_equipment'` and `status='open'`
- WHEN an admin opens the tarea detail view for T
- THEN `ConfigureEquipmentPanel` is rendered

#### Scenario: TareaDetailPage renders ConfigureEquipmentPanel for replace_equipment ticket

- GIVEN a `support.tickets` row T with `category='replace_equipment'`
- WHEN an admin opens the tarea detail view for T
- THEN `ConfigureEquipmentPanel` is rendered

#### Scenario: TareaDetailPage uses non-two-step path for maintain_equipment and update_equipment tickets

- GIVEN a `support.tickets` row T with `category='maintain_equipment'`
- WHEN an admin opens the tarea detail view for T
- THEN `ConfigureEquipmentPanel` is NOT rendered
- AND the same applies to `category='update_equipment'`

### Requirement: ConfigureEquipmentPanel TypeScript Union and Label Maps — Updated

`ConfigureEquipmentPanel` MUST accept `'install_equipment'` and `'replace_equipment'` in its TypeScript category prop union. Any references to `'equipment_installation'`, `'equipment_replacement'`, or `'installation'` in the component's type annotations, heading maps, or help-copy maps MUST be replaced with the new names.

#### Scenario: ConfigureEquipmentPanel renders with correct heading for install_equipment ticket

- GIVEN a ticket T with `category='install_equipment'`
- WHEN `ConfigureEquipmentPanel` renders with T
- THEN the panel heading reflects the install category
- AND the serial and model fields are displayed

#### Scenario: ConfigureEquipmentPanel renders with correct heading for replace_equipment ticket

- GIVEN a ticket T with `category='replace_equipment'`
- WHEN `ConfigureEquipmentPanel` renders with T
- THEN the panel heading reflects the replacement category
- AND the serial and model fields are displayed

### Requirement: CATEGORY_LABELS in TareasTable and TareaFormSheet — Updated

`TareasTable` and `TareaFormSheet` MUST update their `CATEGORY_LABELS` maps to use the four new category names as keys. The old keys MUST be removed.

The new map MUST contain exactly:

```ts
const CATEGORY_LABELS = {
  install_equipment:  '...',
  replace_equipment:  '...',
  update_equipment:   '...',
  maintain_equipment: '...',
}
```

Label copy is at the designer's discretion; the structural constraint is that every key corresponds 1-to-1 with a value from the new 4-value domain, with no old keys present.

#### Scenario: TareasTable renders all four new category labels without errors

- GIVEN the updated CATEGORY_LABELS map is in place
- WHEN a `support.tickets` row with `category='install_equipment'` is rendered
- THEN the correct label string is displayed
- AND the same succeeds for each of `replace_equipment`, `update_equipment`, `maintain_equipment`

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
