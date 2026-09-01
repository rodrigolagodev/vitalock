# Admin Tarea Detail

**Changes**:
- technical-installation-stock-lifecycle (2026-08-31)
- ticket-taxonomy-cleanup (2026-09-01)

---

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
