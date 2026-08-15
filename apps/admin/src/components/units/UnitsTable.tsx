import { useState } from 'react';
import { PencilLine, Power } from 'lucide-react';
import { StatusBadge } from '@vitalock/ui';
import { Badge } from '@vitalock/ui';
import { DataTable, type DataTableAction } from '@vitalock/ui';
import { UnitFormSheet } from './UnitFormSheet';
import { useMutateUnit } from '@/hooks/useMutateUnit';
import type { UnitRow } from '@/hooks/useUnits';

interface UnitsTableProps {
  buildingId: string;
  units: UnitRow[];
  isFetching?: boolean;
}

export function UnitsTable({ buildingId, units, isFetching = false }: UnitsTableProps) {
  const [editingUnit, setEditingUnit] = useState<UnitRow | null>(null);
  const { deactivateUnit } = useMutateUnit(buildingId);

  const actions: DataTableAction<UnitRow>[] = [
    {
      icon: PencilLine,
      label: (u) => `Editar a ${u.number}`,
      onClick: (u) => setEditingUnit(u),
    },
    {
      icon: Power,
      label: (u) => `Desactivar ${u.number}`,
      show: (u) => u.status === 'active',
      disabled: () => deactivateUnit.isPending,
      className: 'text-destructive hover:text-destructive',
      onClick: (u) => deactivateUnit.mutate({ id: u.id, building_id: buildingId }),
    },
  ];

  return (
    <>
      <DataTable<UnitRow>
        rows={units}
        isFetching={isFetching}
        rowKey={(u) => u.id}
        emptyMessage="No hay unidades registradas."
        actions={actions}
        columns={[
          { header: 'Número', cell: (u) => u.number },
          {
            header: 'Estado',
            cell: (u) => (
              <StatusBadge tone={u.status === 'active' ? 'success' : 'neutral'}>
                {u.status === 'active' ? 'Activa' : 'Inactiva'}
              </StatusBadge>
            ),
          },
          {
            header: 'Administrativa',
            cell: (u) =>
              u.is_administrative ? (
                <Badge variant="outline">Sí</Badge>
              ) : (
                <span className="text-muted-foreground text-sm">No</span>
              ),
          },
        ]}
      />

      <UnitFormSheet
        open={Boolean(editingUnit)}
        onOpenChange={(open) => {
          if (!open) setEditingUnit(null);
        }}
        buildingId={buildingId}
        unit={editingUnit}
      />
    </>
  );
}
