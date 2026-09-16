import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PencilLine, RefreshCw } from 'lucide-react';
import { Button, DataCardList } from '@vitalock/ui';
import { formatDate } from '@/lib/format';
import type { EquipmentRow } from '@/hooks/useEquipment';
import { equipmentStatus } from '@/lib/status/equipmentStatus';
import { EquipmentFormSheet } from './EquipmentFormSheet';
import { ReplaceEquipmentDialog } from './ReplaceEquipmentDialog';

interface EquipmentTableProps {
  buildingId: string;
  equipment: EquipmentRow[];
  isFetching?: boolean;
}

export function EquipmentTable({ buildingId, equipment, isFetching = false }: EquipmentTableProps) {
  const navigate = useNavigate();
  const [editingEquipment, setEditingEquipment] = useState<EquipmentRow | null>(null);
  const [replacingEquipment, setReplacingEquipment] = useState<EquipmentRow | null>(null);

  return (
    <>
      <DataCardList<EquipmentRow>
        rows={equipment}
        isFetching={isFetching}
        rowKey={(i) => i.id}
        emptyMessage="No hay equipos registrados."
        firstCell="button"
        onFirstCellClick={(i) => navigate(`/equipos/${i.id}`)}
        renderActions={(i) => (
          <div className="flex w-full items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1 gap-2"
              aria-label={`Editar a ${i.model ?? i.serial_number}`}
              onClick={() => setEditingEquipment(i)}
            >
              <PencilLine className="h-4 w-4" />
              Editar
            </Button>
            {i.status !== 'dead' && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1 gap-2"
                aria-label={`Reemplazar ${i.model ?? i.serial_number}`}
                onClick={() => setReplacingEquipment(i)}
              >
                <RefreshCw className="h-4 w-4" />
                Reemplazar
              </Button>
            )}
          </div>
        )}
        columns={[
          { header: 'Modelo', cell: (i) => i.model ?? '—' },
          {
            header: 'Número de serie',
            cell: (i) => <span className="font-mono text-sm">{i.serial_number}</span>,
          },
          {
            header: 'Estado',
            cell: (i) => <equipmentStatus.Badge status={i.status} />,
            card: 'status',
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
