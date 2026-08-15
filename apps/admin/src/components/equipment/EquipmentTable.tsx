import { useState } from 'react';
import { PencilLine, RefreshCw } from 'lucide-react';
import { StatusBadge, type StatusTone } from '@vitalock/ui';
import { DataTable, type DataTableAction } from '@vitalock/ui';
import type { EquipmentRow } from '@/hooks/useEquipment';
import { EquipmentFormSheet } from './EquipmentFormSheet';
import { ReplaceEquipmentDialog } from './ReplaceEquipmentDialog';

const STATUS_LABELS: Record<string, string> = {
  active: 'Activo',
  maintenance: 'Mantenimiento',
  dead: 'Dado de baja',
};

const STATUS_TONES: Record<string, StatusTone> = {
  active: 'success',
  maintenance: 'warning',
  dead: 'danger',
};

interface EquipmentTableProps {
  buildingId: string;
  equipment: EquipmentRow[];
  isFetching?: boolean;
}

export function EquipmentTable({
  buildingId,
  equipment,
  isFetching = false,
}: EquipmentTableProps) {
  const [editingEquipment, setEditingEquipment] = useState<EquipmentRow | null>(null);
  const [replacingEquipment, setReplacingEquipment] = useState<EquipmentRow | null>(null);

  const actions: DataTableAction<EquipmentRow>[] = [
    {
      icon: PencilLine,
      label: (i) => `Editar a ${i.model ?? i.serial_number}`,
      onClick: (i) => setEditingEquipment(i),
    },
    {
      icon: RefreshCw,
      label: (i) => `Reemplazar ${i.model ?? i.serial_number}`,
      show: (i) => i.status !== 'dead',
      onClick: (i) => setReplacingEquipment(i),
    },
  ];

  return (
    <>
      <DataTable<EquipmentRow>
        rows={equipment}
        isFetching={isFetching}
        rowKey={(i) => i.id}
        emptyMessage="No hay equipos registrados."
        actions={actions}
        columns={[
          { header: 'Modelo', cell: (i) => i.model ?? '—' },
          {
            header: 'Número de serie',
            cell: (i) => <span className="font-mono text-sm">{i.serial_number}</span>,
          },
          {
            header: 'Estado',
            cell: (i) => (
              <StatusBadge tone={STATUS_TONES[i.status] ?? 'neutral'}>
                {STATUS_LABELS[i.status] ?? i.status}
              </StatusBadge>
            ),
          },
          {
            header: 'Instalado',
            className: 'text-sm text-muted-foreground',
            cell: (i) =>
              i.installed_at
                ? new Date(i.installed_at).toLocaleDateString('es-AR')
                : '—',
          },
        ]}
      />

      <EquipmentFormSheet
        open={Boolean(editingEquipment)}
        onOpenChange={(open) => {
          if (!open) setEditingEquipment(null);
        }}
        buildingId={buildingId}
        equipment={editingEquipment}
      />

      {replacingEquipment && (
        <ReplaceEquipmentDialog
          open={Boolean(replacingEquipment)}
          onOpenChange={(open) => {
            if (!open) setReplacingEquipment(null);
          }}
          equipment={replacingEquipment}
          buildingId={buildingId}
        />
      )}
    </>
  );
}
