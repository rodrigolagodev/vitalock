import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
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
import { useKeysInventory } from '@/hooks/useKeysInventory';
import { useAdministrations } from '@/hooks/useAdministrations';
import { useBuildings } from '@/hooks/useBuildings';
import { useEquipmentByBuilding } from '@/hooks/useEquipmentByBuilding';
import { CascadeFilter, type CascadeFilterValue } from '@/components/filters/CascadeFilter';
import { KeysInventoryTable } from '@/components/llaves/KeysInventoryTable';
import type { CascadeOption } from '@/components/filters/CascadeFilter';

const PHYSICAL_STATUS_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'pending_creation', label: 'En creación' },
  { value: 'pending_installation', label: 'Pendiente instalación' },
  { value: 'active', label: 'Activa' },
  { value: 'pending_disable', label: 'Baja solicitada' },
  { value: 'disabled', label: 'Dada de baja' },
];

const WORKFLOW_STATUS_OPTIONS = [
  { value: 'all', label: 'Todas' },
  { value: '__none__', label: 'Sin orden activa' },
  { value: 'draft', label: 'Borrador' },
  { value: 'confirmed', label: 'Confirmada' },
  { value: 'in_progress', label: 'En proceso' },
  { value: 'pending_installation', label: 'Pendiente instalación' },
  { value: 'ready_for_pickup', label: 'Listo para retirar' },
];

export default function InventarioPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const cascadeValue: CascadeFilterValue = useMemo(
    () => ({
      administrationId: searchParams.get('adminId') ?? undefined,
      buildingId: searchParams.get('buildingId') ?? undefined,
      equipmentId: searchParams.get('equipmentId') ?? undefined,
    }),
    [searchParams],
  );
  const physicalStatus = searchParams.get('physicalStatus') ?? 'all';
  const workflowStatus = searchParams.get('workflowStatus') ?? 'all';

  const updateParams = (updates: Record<string, string | undefined>) => {
    const next = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(updates)) {
      if (v == null || v === '') {
        next.delete(k);
      } else {
        next.set(k, v);
      }
    }
    setSearchParams(next, { replace: true });
  };

  const setCascadeValue = (v: CascadeFilterValue) => {
    updateParams({
      adminId: v.administrationId,
      buildingId: v.buildingId,
      equipmentId: v.equipmentId,
    });
  };

  const setPhysicalStatus = (v: string) => {
    updateParams({ physicalStatus: v === 'all' ? undefined : v });
  };

  const setWorkflowStatus = (v: string) => {
    updateParams({ workflowStatus: v === 'all' ? undefined : v });
  };

  const { data: admins = [] } = useAdministrations();
  const { data: buildings = [] } = useBuildings();
  const { data: equipmentByBuilding = [] } = useEquipmentByBuilding(cascadeValue.buildingId, { activeOnly: true });

  const { data: rows = [], isFetching, isError } = useKeysInventory({
    administrationId: cascadeValue.administrationId,
    buildingId: cascadeValue.buildingId,
    equipmentId: cascadeValue.equipmentId,
    physicalStatus,
    workflowStatus,
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

  const equipmentOptions: CascadeOption[] = equipmentByBuilding.map((e) => ({
    id: e.id,
    label: e.model ? `${e.model} · ${e.serial_number}` : e.serial_number,
    parentId: e.building_id,
  }));

  if (isError) {
    return <ErrorState message="Error al cargar el inventario de llaves. Recargá la página." />;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Inventario de llaves">
        <Button asChild>
          <Link to="/llaves/nueva">Crear orden de llave</Link>
        </Button>
      </PageHeader>

      <div className="flex flex-col gap-4">
        <CascadeFilter
          value={cascadeValue}
          onChange={setCascadeValue}
          levels={['administration', 'building', 'equipment']}
          administrations={adminOptions}
          buildings={buildingOptions}
          equipment={equipmentOptions}
        />

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex flex-col gap-1">
            <Label
              htmlFor="physical-status"
              className="text-xs font-medium uppercase text-muted-foreground"
            >
              Estado físico
            </Label>
            <Select value={physicalStatus} onValueChange={setPhysicalStatus}>
              <SelectTrigger
                id="physical-status"
                aria-label="Estado físico"
                className="w-56"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PHYSICAL_STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <Label
              htmlFor="workflow-status"
              className="text-xs font-medium uppercase text-muted-foreground"
            >
              Estado de orden
            </Label>
            <Select value={workflowStatus} onValueChange={setWorkflowStatus}>
              <SelectTrigger
                id="workflow-status"
                aria-label="Estado de orden"
                className="w-56"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WORKFLOW_STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <KeysInventoryTable
        rows={rows}
        isFetching={isFetching}
        hasFilters={
          cascadeValue.administrationId != null ||
          cascadeValue.buildingId != null ||
          cascadeValue.equipmentId != null ||
          physicalStatus !== 'all' ||
          workflowStatus !== 'all'
        }
      />
    </div>
  );
}
