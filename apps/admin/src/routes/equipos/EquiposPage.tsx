import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Button,
  ErrorState,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@vitalock/ui';
import { PageHeader } from '@/components/layout/PageHeader';
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
  const { data: equipmentByBuilding = [] } = useEquipmentByBuilding(cascadeValue.buildingId);

  const { data: rows = [], isFetching, isError } = useEquipmentInventory({
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

      <div className="flex flex-col gap-4">
        <CascadeFilter
          value={cascadeValue}
          onChange={setCascadeValue}
          levels={['administration', 'building']}
          administrations={adminOptions}
          buildings={buildingOptions}
          equipment={equipmentOptions}
        />

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex flex-col gap-1">
            <Label
              htmlFor="equipment-status"
              className="text-xs font-medium uppercase text-muted-foreground"
            >
              Estado del equipo
            </Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger
                id="equipment-status"
                aria-label="Estado del equipo"
                className="w-56"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EQUIPMENT_STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <EquipmentInventoryTable rows={rows} isFetching={isFetching} />
    </div>
  );
}
