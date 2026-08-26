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
          <label
            htmlFor="cascade-admin"
            className="text-xs font-medium text-muted-foreground uppercase"
          >
            Administración
          </label>
          <select
            id="cascade-admin"
            aria-label="Administración"
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={value.administrationId ?? ''}
            disabled={disabled}
            onChange={(e) => handleAdminChange(e.target.value)}
          >
            <option value="">Todas</option>
            {administrations.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {showBuilding && (
        <div className="flex flex-col gap-1">
          <label
            htmlFor="cascade-building"
            className="text-xs font-medium text-muted-foreground uppercase"
          >
            Edificio
          </label>
          <select
            id="cascade-building"
            aria-label="Edificio"
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={value.buildingId ?? ''}
            disabled={disabled || !value.administrationId}
            onChange={(e) => handleBuildingChange(e.target.value)}
          >
            <option value="">Todos</option>
            {filteredBuildings.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {showEquipment && (
        <div className="flex flex-col gap-1">
          <label
            htmlFor="cascade-equipment"
            className="text-xs font-medium text-muted-foreground uppercase"
          >
            Equipo
          </label>
          <select
            id="cascade-equipment"
            aria-label="Equipo"
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={value.equipmentId ?? ''}
            disabled={disabled || !value.buildingId}
            onChange={(e) => handleEquipmentChange(e.target.value)}
          >
            <option value="">Todos</option>
            {filteredEquipment.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
