import { useNavigate } from 'react-router-dom';
import { DataTable, StatusBadge } from '@vitalock/ui';
import type { EquipmentInventoryRow } from '@/hooks/useEquipmentInventory';
import {
  equipmentStatusLabel,
  equipmentStatusTone,
} from '@/lib/status/equipmentStatus';

interface EquipmentInventoryTableProps {
  rows: EquipmentInventoryRow[];
  isFetching?: boolean;
}

export function EquipmentInventoryTable({
  rows,
  isFetching = false,
}: EquipmentInventoryTableProps) {
  const navigate = useNavigate();

  return (
    <DataTable<EquipmentInventoryRow>
      rows={rows}
      isFetching={isFetching}
      rowKey={(r) => r.id ?? ''}
      emptyMessage="No hay equipos registrados en el inventario."
      firstCell="button"
      onFirstCellClick={(r) => {
        if (r.id) navigate(`/equipos/${r.id}`);
      }}
      columns={[
        {
          header: 'Número de serie',
          cell: (r) => (
            <span className="font-mono text-sm">{r.serial_number ?? '—'}</span>
          ),
        },
        {
          header: 'Modelo',
          cell: (r) => r.model ?? '—',
        },
        {
          header: 'Estado',
          cell: (r) => (
            <StatusBadge tone={equipmentStatusTone(r.status)}>
              {equipmentStatusLabel(r.status)}
            </StatusBadge>
          ),
        },
        {
          header: 'Edificio',
          cell: (r) => r.building_name ?? '—',
        },
        {
          header: 'Administración',
          cell: (r) => r.administration_company_name ?? '—',
        },
        {
          header: 'Llaves',
          cell: (r) => r.key_count ?? 0,
        },
      ]}
    />
  );
}
