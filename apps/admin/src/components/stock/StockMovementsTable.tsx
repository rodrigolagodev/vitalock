import { Link } from 'react-router-dom';
import { DataTable } from '@vitalock/ui';
import { formatCurrency, formatDateTime } from '@/lib/format';
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

function formatQuantity(qty: number): string {
  return qty > 0 ? `+${qty}` : String(qty);
}

const REFERENCE_LINK_CLASS = 'text-primary underline-offset-2 hover:underline';

/**
 * Renders the "Referencia" cell as a navigation link so someone tracing a case
 * can jump from a movement straight to the linked ticket (tarea) or order.
 * Order routes are disambiguated by `order_kind` ('key' -> key orders,
 * 'technical' -> technical orders). When the linkage target cannot be resolved
 * (no id, or order_kind unknown), the plain label is kept as text.
 */
function ReferenceCell({ row }: { row: StockMovementRow }) {
  if (row.ticket_id) {
    return (
      <Link to={`/tareas/${row.ticket_id}`} className={REFERENCE_LINK_CLASS}>
        {row.ticket_number ?? row.ticket_id.slice(0, 8)}
      </Link>
    );
  }
  // A ticket number can exist historically even when the ticket id is missing.
  if (row.ticket_number) {
    return <span>{row.ticket_number}</span>;
  }

  if (row.order_id) {
    const label = `Orden ${row.order_id.slice(0, 8)}…`;
    if (row.order_kind === 'key') {
      return (
        <Link to={`/llaves/${row.order_id}`} className={REFERENCE_LINK_CLASS}>
          {label}
        </Link>
      );
    }
    if (row.order_kind === 'technical') {
      return (
        <Link to={`/servicio-tecnico/${row.order_id}`} className={REFERENCE_LINK_CLASS}>
          {label}
        </Link>
      );
    }
    // Order kind unavailable — cannot resolve the detail route.
    return <span>{label}</span>;
  }

  return <span>—</span>;
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
                  ? 'font-medium text-success'
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
          cell: (m) => formatCurrency(m.unit_cost),
        },
        {
          header: 'Personal',
          className: 'text-muted-foreground',
          cell: (m) => m.staff_name ?? '—',
        },
        {
          header: 'Referencia',
          className: 'text-muted-foreground',
          cell: (m) => <ReferenceCell row={m} />,
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
