import { useState } from 'react';
import { PencilLine } from 'lucide-react';
import { DataTable, StatusBadge, IconButton } from '@vitalock/ui';
import { BuildingFormSheet } from './BuildingFormSheet';
import { BuildingStatusToggle } from './BuildingStatusToggle';
import type { BuildingRow } from '@/hooks/useBuildings';

interface BuildingsTableProps {
  buildings: BuildingRow[];
  /** When true, replaces rows with 3 skeleton placeholders */
  isFetching?: boolean;
}

export function BuildingsTable({ buildings, isFetching = false }: BuildingsTableProps) {
  const [editingBuilding, setEditingBuilding] = useState<BuildingRow | null>(null);

  return (
    <>
      <DataTable<BuildingRow>
        rows={buildings}
        isFetching={isFetching}
        columns={[
          { header: 'Nombre', cell: (building) => building.name },
          {
            header: 'Dirección',
            cell: (building) => (
              <span className="text-muted-foreground">{building.address ?? '—'}</span>
            ),
          },
          {
            header: 'Estado',
            cell: (building) => (
              <StatusBadge tone={building.status === 'active' ? 'success' : 'neutral'}>
                {building.status === 'active' ? 'Activo' : 'Inactivo'}
              </StatusBadge>
            ),
          },
          {
            header: 'Llaves',
            className: 'text-center',
            cell: (building) => building.key_count,
          },
          {
            header: 'Equipos',
            className: 'text-center',
            cell: (building) => building.equipment_count,
          },
        ]}
        rowKey={(building) => building.id}
        firstCell="link"
        getRowHref={(building) => `/buildings/${building.id}`}
        emptyMessage="No hay edificios registrados."
        renderActions={(building) => (
          <div className="flex items-center justify-end gap-1">
            <IconButton
              icon={PencilLine}
              label={`Editar a ${building.name}`}
              onClick={() => setEditingBuilding(building)}
            />
            <BuildingStatusToggle building={building} />
          </div>
        )}
      />

      <BuildingFormSheet
        open={Boolean(editingBuilding)}
        onOpenChange={(open) => {
          if (!open) setEditingBuilding(null);
        }}
        building={editingBuilding}
      />
    </>
  );
}
