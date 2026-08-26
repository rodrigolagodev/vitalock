import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@vitalock/ui';
import { useKeysInventory } from '@/hooks/useKeysInventory';
import { useAdministrations } from '@/hooks/useAdministrations';
import { useBuildings } from '@/hooks/useBuildings';
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
  const [cascadeValue, setCascadeValue] = useState<CascadeFilterValue>({});
  const [physicalStatus, setPhysicalStatus] = useState('all');
  const [workflowStatus, setWorkflowStatus] = useState('all');

  const { data: admins = [] } = useAdministrations();
  const { data: buildings = [] } = useBuildings();

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

  // Equipment is sourced from the inventory rows themselves (no extra query needed)
  const equipmentOptions: CascadeOption[] = [];

  if (isError) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-destructive">
          Error al cargar el inventario de llaves. Recargá la página.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Inventario de llaves</h1>
        <Button asChild>
          <Link to="/llaves/nueva">Crear orden de llave</Link>
        </Button>
      </div>

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
            <label
              htmlFor="physical-status"
              className="text-xs font-medium uppercase text-muted-foreground"
            >
              Estado físico
            </label>
            <select
              id="physical-status"
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={physicalStatus}
              onChange={(e) => setPhysicalStatus(e.target.value)}
            >
              {PHYSICAL_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="workflow-status"
              className="text-xs font-medium uppercase text-muted-foreground"
            >
              Estado de orden
            </label>
            <select
              id="workflow-status"
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={workflowStatus}
              onChange={(e) => setWorkflowStatus(e.target.value)}
            >
              {WORKFLOW_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <KeysInventoryTable rows={rows} isFetching={isFetching} />
    </div>
  );
}
