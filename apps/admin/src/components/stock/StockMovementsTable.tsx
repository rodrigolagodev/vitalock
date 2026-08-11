import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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

function SkeletonRow() {
  return (
    <TableRow>
      <TableCell><div className="h-4 w-32 animate-pulse rounded-md bg-muted" /></TableCell>
      <TableCell><div className="h-4 w-32 animate-pulse rounded-md bg-muted" /></TableCell>
      <TableCell><div className="h-4 w-16 animate-pulse rounded-md bg-muted" /></TableCell>
      <TableCell><div className="h-4 w-28 animate-pulse rounded-md bg-muted" /></TableCell>
      <TableCell><div className="h-4 w-24 animate-pulse rounded-md bg-muted" /></TableCell>
      <TableCell><div className="h-4 w-40 animate-pulse rounded-md bg-muted" /></TableCell>
      <TableCell><div className="h-4 w-32 animate-pulse rounded-md bg-muted" /></TableCell>
    </TableRow>
  );
}

export function StockMovementsTable({
  rows,
  isFetching,
  hasFilters = false,
}: StockMovementsTableProps) {
  if (isFetching) {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Cantidad</TableHead>
            <TableHead>Costo unitario</TableHead>
            <TableHead>Personal</TableHead>
            <TableHead>Referencia</TableHead>
            <TableHead>Notas</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </TableBody>
      </Table>
    );
  }

  if (rows.length === 0 && !hasFilters) {
    return (
      <div className="flex flex-col items-center justify-center rounded-md border border-dashed py-12 text-center">
        <p className="text-sm text-muted-foreground">
          No hay movimientos de stock para este producto.
        </p>
      </div>
    );
  }

  if (rows.length === 0 && hasFilters) {
    return (
      <div className="flex flex-col items-center justify-center rounded-md border border-dashed py-12 text-center">
        <p className="text-sm text-muted-foreground">
          No se encontraron movimientos con los filtros aplicados.
        </p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Fecha</TableHead>
          <TableHead>Tipo</TableHead>
          <TableHead>Cantidad</TableHead>
          <TableHead>Costo unitario</TableHead>
          <TableHead>Personal</TableHead>
          <TableHead>Referencia</TableHead>
          <TableHead>Notas</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((movement) => (
          <TableRow key={movement.id}>
            <TableCell className="text-muted-foreground">
              {formatDateTime(movement.created_at)}
            </TableCell>
            <TableCell>{MOVEMENT_LABELS[movement.type]}</TableCell>
            <TableCell
              className={
                movement.quantity > 0
                  ? 'font-medium text-emerald-600'
                  : 'font-medium text-destructive'
              }
            >
              {formatQuantity(movement.quantity)}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {formatCost(movement.unit_cost)}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {movement.staff_name ?? '—'}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {formatReference(movement)}
            </TableCell>
            <TableCell className="max-w-xs truncate text-muted-foreground">
              {movement.note ?? '—'}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
