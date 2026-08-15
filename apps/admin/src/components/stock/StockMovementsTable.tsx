import { DataTable } from '@vitalock/ui';
import type { MovementType, StockMovementRow } from '@/types/stock';

interface StockMovementsTableProps {
  rows: StockMovementRow[];
  isFetching: boolean;
  hasFilters?: boolean;
}

const MOVEMENT_LABELS: Record<MovementType, string> = {
  compra: 'Compra',
  devolucion: 'Devolución',
  ajuste_manual: 'Ajuste manual',
  egreso_grabacion: 'Egreso por grabación',
  egreso_instalacion: 'Egreso por instalación',
  baja_defectuoso: 'Baja por defectuoso',
  baja_perdida: 'Baja por pérdida',
  reserva: 'Reserva',
  liberacion_reserva: 'Liberación de reserva',
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' });
}

function formatCost(value: number | null): string {
  if (value == null) return '—';
  return value.toLocaleString('es-AR', {
    style: 'currency',
    currency: 'ARS',
  });
}

function formatQuantity(qty: number): string {
  return qty > 0 ? `+${qty}` : String(qty);
}

function formatReference(row: StockMovementRow): string {
  if (row.ticket_number) return row.ticket_number;
  if (row.order_id) return `Orden ${row.order_id.slice(0, 8)}…`;
  return '—';
}

export function StockMovementsTable({
  rows,
  isFetching,
  hasFilters = false,
}: StockMovementsTableProps) {
  return (
    <DataTable<StockMovementRow>
      rows={rows}
      isFetching={isFetching}
      rowKey={(m) => m.id}
      emptyMessage="No hay movimientos de stock para este producto."
      filteredEmptyMessage="No se encontraron movimientos con los filtros aplicados."
      hasFilters={hasFilters}
      columns={[
        {
          header: 'Fecha',
          cell: (m) => (
            <span className="text-muted-foreground">{formatDateTime(m.created_at)}</span>
          ),
        },
        { header: 'Tipo', cell: (m) => MOVEMENT_LABELS[m.type] },
        {
          header: 'Cantidad',
          cell: (m) => (
            <span
              className={
                m.quantity > 0
                  ? 'font-medium text-emerald-600'
                  : 'font-medium text-destructive'
              }
            >
              {formatQuantity(m.quantity)}
            </span>
          ),
        },
        {
          header: 'Costo unitario',
          className: 'text-muted-foreground',
          cell: (m) => formatCost(m.unit_cost),
        },
        {
          header: 'Personal',
          className: 'text-muted-foreground',
          cell: (m) => m.staff_name ?? '—',
        },
        {
          header: 'Referencia',
          className: 'text-muted-foreground',
          cell: (m) => formatReference(m),
        },
        {
          header: 'Notas',
          className: 'max-w-xs truncate text-muted-foreground',
          cell: (m) => m.note ?? '—',
        },
      ]}
    />
  );
}
