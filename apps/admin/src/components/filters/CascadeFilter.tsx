import {
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@vitalock/ui';

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
    <div className="flex flex-wrap items-end gap-3">
      {showAdmin && (
        <div className="flex flex-col gap-1">
          <Label
            htmlFor="cascade-admin"
            className="text-xs font-medium uppercase text-muted-foreground"
          >
            Administración
          </Label>
          <Select
            value={value.administrationId ?? ALL_VALUE}
            disabled={disabled}
            onValueChange={(v) =>
              handleAdminChange(v === ALL_VALUE ? '' : v)
            }
          >
            <SelectTrigger id="cascade-admin" aria-label="Administración" className="w-56">
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>Todas</SelectItem>
              {administrations.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {showBuilding && (
        <div className="flex flex-col gap-1">
          <Label
            htmlFor="cascade-building"
            className="text-xs font-medium uppercase text-muted-foreground"
          >
            Edificio
          </Label>
          <Select
            value={value.buildingId ?? ALL_VALUE}
            disabled={disabled || !value.administrationId}
            onValueChange={(v) =>
              handleBuildingChange(v === ALL_VALUE ? '' : v)
            }
          >
            <SelectTrigger id="cascade-building" aria-label="Edificio" className="w-56">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>Todos</SelectItem>
              {filteredBuildings.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {showEquipment && (
        <div className="flex flex-col gap-1">
          <Label
            htmlFor="cascade-equipment"
            className="text-xs font-medium uppercase text-muted-foreground"
          >
            Equipo
          </Label>
          <Select
            value={value.equipmentId ?? ALL_VALUE}
            disabled={disabled || !value.buildingId}
            onValueChange={(v) =>
              handleEquipmentChange(v === ALL_VALUE ? '' : v)
            }
          >
            <SelectTrigger id="cascade-equipment" aria-label="Equipo" className="w-56">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>Todos</SelectItem>
              {filteredEquipment.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
