import { PlusCircle } from 'lucide-react';
import { Badge, Select, SelectContent, SelectItem, SelectTrigger, Separator } from '@vitalock/ui';

/**
 * Radix Select disallows empty string as a value, so we use a sentinel token
 * for the "all/none" option and normalize it on the way out.
 */
const ALL_VALUE = '__all__';

export interface CascadeOption {
  id: string;
  label: string;
  /** For buildings: administrationId; for equipment: buildingId */
  parentId?: string;
}

export interface CascadeFilterValue {
  administrationId?: string;
  buildingId?: string;
  equipmentId?: string;
}

export interface CascadeFilterProps {
  value: CascadeFilterValue;
  onChange: (next: CascadeFilterValue) => void;
  levels: ('administration' | 'building' | 'equipment')[];
  administrations: CascadeOption[];
  buildings: CascadeOption[];
  equipment: CascadeOption[];
  disabled?: boolean;
}

/**
 * Compact dashed-border trigger, same visual family as
 * `FilterBar.Select`/`FilterBar.MultiSelect` (packages/ui) — a leading icon,
 * the level's own label always visible, and the selected option rendered as
 * an inline Badge once picked, instead of Radix's wide `SelectValue`. Not
 * built on `FilterBar.Select` itself: that component self-registers a facet
 * into `FilterBar`'s summary/chip registry, and `FilterBar.Cascade` (the
 * wrapper this component is always rendered inside) already registers one
 * facet per level — reusing `FilterBar.Select` here would double-register.
 * `hint`, when given, is a screen-reader-only explanation (not a visible
 * line below the trigger) so a disabled level doesn't reintroduce the
 * stacked-label height mismatch `FilterBar.DateRange` had before its own
 * popover-trigger fix.
 */
function CascadeSelectTrigger({
  id,
  label,
  value,
  selectedLabel,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  selectedLabel: string | undefined;
  hint?: string;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <>
      <SelectTrigger
        id={id}
        aria-label={label}
        aria-describedby={hintId}
        className="w-auto justify-start gap-2 border-dashed px-3 text-sm font-medium"
      >
        <PlusCircle className="h-4 w-4 shrink-0" />
        {label}
        {value !== ALL_VALUE && selectedLabel && (
          <>
            <Separator orientation="vertical" className="mx-1 h-4" />
            <Badge variant="secondary" className="rounded-sm px-1.5 font-normal">
              {selectedLabel}
            </Badge>
          </>
        )}
      </SelectTrigger>
      {hint && (
        <span id={hintId} className="sr-only">
          {hint}
        </span>
      )}
    </>
  );
}

export function CascadeFilter({
  value,
  onChange,
  levels,
  administrations,
  buildings,
  equipment,
  disabled = false,
}: CascadeFilterProps) {
  const showAdmin = levels.includes('administration');
  const showBuilding = levels.includes('building');
  const showEquipment = levels.includes('equipment');

  const filteredBuildings = value.administrationId
    ? buildings.filter((b) => b.parentId === value.administrationId)
    : buildings;

  const filteredEquipment = value.buildingId
    ? equipment.filter((e) => e.parentId === value.buildingId)
    : equipment;

  const buildingDisabled = disabled || !value.administrationId;
  const equipmentDisabled = disabled || !value.buildingId;

  function handleAdminChange(adminId: string) {
    if (!adminId) {
      onChange({});
    } else {
      onChange({ administrationId: adminId });
    }
  }

  function handleBuildingChange(buildingId: string) {
    if (!buildingId) {
      onChange({ administrationId: value.administrationId });
    } else {
      onChange({ administrationId: value.administrationId, buildingId });
    }
  }

  function handleEquipmentChange(equipmentId: string) {
    if (!equipmentId) {
      onChange({
        administrationId: value.administrationId,
        buildingId: value.buildingId,
      });
    } else {
      onChange({
        administrationId: value.administrationId,
        buildingId: value.buildingId,
        equipmentId,
      });
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {showAdmin && (
        <Select
          value={value.administrationId ?? ALL_VALUE}
          disabled={disabled}
          onValueChange={(v) => handleAdminChange(v === ALL_VALUE ? '' : v)}
        >
          <CascadeSelectTrigger
            id="cascade-admin"
            label="Administración"
            value={value.administrationId ?? ALL_VALUE}
            selectedLabel={administrations.find((a) => a.id === value.administrationId)?.label}
          />
          <SelectContent>
            <SelectItem value={ALL_VALUE}>Todas</SelectItem>
            {administrations.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {showBuilding && (
        <Select
          value={value.buildingId ?? ALL_VALUE}
          disabled={buildingDisabled}
          onValueChange={(v) => handleBuildingChange(v === ALL_VALUE ? '' : v)}
        >
          <CascadeSelectTrigger
            id="cascade-building"
            label="Edificio"
            value={value.buildingId ?? ALL_VALUE}
            selectedLabel={filteredBuildings.find((b) => b.id === value.buildingId)?.label}
            hint={
              !disabled && !value.administrationId
                ? 'Seleccioná una administración primero'
                : undefined
            }
          />
          <SelectContent>
            <SelectItem value={ALL_VALUE}>Todos</SelectItem>
            {filteredBuildings.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {showEquipment && (
        <Select
          value={value.equipmentId ?? ALL_VALUE}
          disabled={equipmentDisabled}
          onValueChange={(v) => handleEquipmentChange(v === ALL_VALUE ? '' : v)}
        >
          <CascadeSelectTrigger
            id="cascade-equipment"
            label="Equipo"
            value={value.equipmentId ?? ALL_VALUE}
            selectedLabel={filteredEquipment.find((e) => e.id === value.equipmentId)?.label}
          />
          <SelectContent>
            <SelectItem value={ALL_VALUE}>Todos</SelectItem>
            {filteredEquipment.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
