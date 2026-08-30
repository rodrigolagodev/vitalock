import { useNavigate } from 'react-router-dom';
import { DataTable, StatusBadge } from '@vitalock/ui';
import type { KeysInventoryRow } from '@/hooks/useKeysInventory';
import { keyStatusLabel, keyStatusTone } from '@/lib/status/keyStatus';
import { keyOrderStatusLabel } from '@/lib/status/keyOrderStatus';

interface KeysInventoryTableProps {
  rows: KeysInventoryRow[];
  isFetching?: boolean;
  hasFilters?: boolean;
}

export function KeysInventoryTable({
  rows,
  isFetching = false,
  hasFilters = false,
}: KeysInventoryTableProps) {
  const navigate = useNavigate();

  return (
    <DataTable<KeysInventoryRow>
      rows={rows}
      isFetching={isFetching}
      rowKey={(r) => r.id ?? ''}
      emptyMessage="No hay llaves registradas en el inventario."
      hasFilters={hasFilters}
      filteredEmptyMessage="No se encontraron llaves con los filtros aplicados."
      firstCell="button"
      onFirstCellClick={(r) => {
        if (r.id) navigate(`/llaves/inventario/${r.id}`);
      }}
      columns={[
        {
          header: 'RFID',
          cell: (r) => <span className="font-mono text-sm">{r.rfid_code ?? '—'}</span>,
        },
        {
          header: 'Unidad',
          cell: (r) => r.unit_number ?? '—',
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
          header: 'Estado físico',
          cell: (r) => (
            <StatusBadge tone={keyStatusTone(r.physical_status)}>
              {keyStatusLabel(r.physical_status)}
            </StatusBadge>
          ),
        },
        {
          header: 'Equipo asignado',
          cell: (r) => r.equipment_serial_number ?? '—',
        },
        {
          header: 'Orden activa',
          cell: (r) =>
            r.active_order_id
              ? keyOrderStatusLabel(r.active_order_status)
              : 'Sin orden',
        },
      ]}
    />
  );
}
