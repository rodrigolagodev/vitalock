import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, ErrorState, FilterBar } from '@vitalock/ui';
import { PageHeader } from '@vitalock/ui';
import { useEquipmentInventory } from '@/hooks/useEquipmentInventory';
import { useAdministrations } from '@/hooks/useAdministrations';
import { useBuildings } from '@/hooks/useBuildings';
import { useEquipmentByBuilding } from '@/hooks/useEquipmentByBuilding';
import { CascadeFilter, type CascadeFilterValue } from '@/components/filters/CascadeFilter';
import { EquipmentInventoryTable } from '@/components/equipos/EquipmentInventoryTable';
import type { CascadeOption } from '@/components/filters/CascadeFilter';

const EQUIPMENT_STATUS_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Activo' },
  { value: 'maintenance', label: 'Mantenimiento' },
  { value: 'dead', label: 'Dado de baja' },
];

export default function EquiposPage() {
  const [cascadeValue, setCascadeValue] = useState<CascadeFilterValue>({});
  const [status, setStatus] = useState('all');

  const { data: admins = [] } = useAdministrations();
  const { data: buildings = [] } = useBuildings();
  const { data: equipmentByBuilding = [] } = useEquipmentByBuilding(cascadeValue.buildingId, {
    activeOnly: true,
  });

  const {
    data: rows = [],
    isFetching,
    isError,
  } = useEquipmentInventory({
    administrationId: cascadeValue.administrationId,
    buildingId: cascadeValue.buildingId,
    status,
  });

  const adminOptions: CascadeOption[] = admins.map((a) => ({
    id: a.id,
    label: a.company_name,
  }));

  const buildingOptions: CascadeOption[] = buildings.map((b) => ({
    id: b.id,
    label: b.name,
    parentId: b.administration_id,
  }));

  // Equipment level for CascadeFilter — populated by useEquipmentByBuilding
  const equipmentOptions: CascadeOption[] = equipmentByBuilding.map((e) => ({
    id: e.id,
    label: e.serial_number,
    parentId: e.building_id,
  }));

  if (isError) {
    return <ErrorState message="Error al cargar el inventario de equipos. Recargá la página." />;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Inventario de equipos">
        <Button asChild>
          <Link to="/servicio-tecnico/nueva">Crear orden técnica</Link>
        </Button>
      </PageHeader>

      <FilterBar>
        <FilterBar.Cascade
          value={{
            administrationId: cascadeValue.administrationId ?? '',
            buildingId: cascadeValue.buildingId ?? '',
            equipmentId: '',
          }}
          onChange={(next) =>
            setCascadeValue({
              administrationId: next.administrationId || undefined,
              buildingId: next.buildingId || undefined,
            })
          }
          labels={{ administration: 'Administración', building: 'Edificio', equipment: 'Equipo' }}
          resolveLabel={(level, id) => {
            if (level === 'administration') {
              return adminOptions.find((a) => a.id === id)?.label ?? id;
            }
            if (level === 'building') {
              return buildingOptions.find((b) => b.id === id)?.label ?? id;
            }
            return id;
          }}
        >
          <CascadeFilter
            value={cascadeValue}
            onChange={setCascadeValue}
            levels={['administration', 'building']}
            administrations={adminOptions}
            buildings={buildingOptions}
            equipment={equipmentOptions}
          />
        </FilterBar.Cascade>

        <FilterBar.Select
          facet="status"
          label="Estado del equipo"
          options={EQUIPMENT_STATUS_OPTIONS}
          value={status}
          onChange={setStatus}
          allValue="all"
        />

        <FilterBar.Summary />
      </FilterBar>

      <EquipmentInventoryTable rows={rows} isFetching={isFetching} />
    </div>
  );
}
