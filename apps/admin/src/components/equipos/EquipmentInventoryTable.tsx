import { useNavigate } from 'react-router-dom';
import { DataCardList } from '@vitalock/ui';
import type { EquipmentInventoryRow } from '@/hooks/useEquipmentInventory';
import { equipmentStatus } from '@/lib/status/equipmentStatus';

interface EquipmentInventoryTableProps {
  rows: EquipmentInventoryRow[];
  isFetching?: boolean;
}

/**
 * Card list of the cross-building equipment inventory — click-through only,
 * no row actions today. Flagged in the design as "hybrid, card-default":
 * this browse view could grow to hundreds of rows across every building, so
 * an optional table/compact-view toggle for large datasets is a documented
 * future follow-up, not part of this conversion.
 */
export function EquipmentInventoryTable({
  rows,
  isFetching = false,
}: EquipmentInventoryTableProps) {
  const navigate = useNavigate();

  return (
    <DataCardList<EquipmentInventoryRow>
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
          cell: (r) => <span className="font-mono text-sm">{r.serial_number ?? '—'}</span>,
        },
        {
          header: 'Modelo',
          cell: (r) => r.model ?? '—',
        },
        {
          header: 'Estado',
          cell: (r) => <equipmentStatus.Badge status={r.status} />,
          card: 'status',
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
