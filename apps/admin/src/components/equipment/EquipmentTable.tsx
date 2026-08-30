import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PencilLine, RefreshCw } from 'lucide-react';
import { StatusBadge } from '@vitalock/ui';
import { DataTable, type DataTableAction } from '@vitalock/ui';
import { formatDate } from '@/lib/format';
import type { EquipmentRow } from '@/hooks/useEquipment';
import {
  equipmentStatusLabel,
  equipmentStatusTone,
} from '@/lib/status/equipmentStatus';
import { EquipmentFormSheet } from './EquipmentFormSheet';
import { ReplaceEquipmentDialog } from './ReplaceEquipmentDialog';

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
  const navigate = useNavigate();
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
        firstCell="button"
        onFirstCellClick={(i) => navigate(`/equipos/${i.id}`)}
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
              <StatusBadge tone={equipmentStatusTone(i.status)}>
                {equipmentStatusLabel(i.status)}
              </StatusBadge>
            ),
          },
          {
            header: 'Instalado',
            className: 'text-sm text-muted-foreground',
            cell: (i) => formatDate(i.installed_at),
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
