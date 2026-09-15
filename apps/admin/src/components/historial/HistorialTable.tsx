import { Key, Wrench } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { DataCardList, StatusBadge, formatMonthHeading, monthKey } from '@vitalock/ui';
import { Badge } from '@vitalock/ui';
import { formatDate } from '@/lib/format';
import { keyOrderStatus } from '@/lib/status/keyOrderStatus';
import { technicalOrderStatus } from '@/lib/status/technicalOrderStatus';
import type { AllOrderRow } from '@/hooks/useAllOrders';

interface HistorialTableProps {
  orders: AllOrderRow[];
  isFetching: boolean;
  hasFilters?: boolean;
}

function OrderKindBadge({ kind }: { kind: AllOrderRow['order_kind'] }) {
  if (kind === 'key') {
    return <Badge variant="secondary">Llaves</Badge>;
  }
  return <Badge variant="secondary">Servicio técnico</Badge>;
}

/**
 * Decorative kind icon — always paired with `OrderKindBadge`'s text
 * elsewhere on the card, so it carries no separate accessible name.
 */
const KIND_ICONS: Record<AllOrderRow['order_kind'], LucideIcon> = {
  key: Key,
  technical: Wrench,
};

function OrderKindIcon({ kind }: { kind: AllOrderRow['order_kind'] }) {
  const Icon = KIND_ICONS[kind];
  return <Icon aria-hidden="true" className="text-muted-foreground h-5 w-5" />;
}

function AllOrderStatusBadge({ row }: { row: AllOrderRow }) {
  const helpers = row.order_kind === 'key' ? keyOrderStatus : technicalOrderStatus;
  return <StatusBadge tone={helpers.tone(row.status)}>{helpers.label(row.status)}</StatusBadge>;
}

/**
 * Card list of admin's company-wide order history (key + technical orders),
 * grouped by month (most recent first) — the admin equivalent of installer
 * HistorialPage's now-established grouping pattern. Each card still shows
 * its own date since a month heading alone doesn't say which day.
 *
 * Kind and Estado both want the card's single header-right badge slot; Kind
 * moves to a decorative `card: 'icon'` column (its text badge stays visible
 * as card meta), freeing `card: 'status'` for Estado alone — the same
 * icon/status-slot split already shipped in installer TareasTable/HistorialPage.
 */
export function HistorialTable({ orders, isFetching, hasFilters = false }: HistorialTableProps) {
  return (
    <DataCardList<AllOrderRow>
      rows={orders}
      isFetching={isFetching}
      columns={[
        { header: 'N.º de orden', cell: (row) => row.order_number },
        {
          header: 'Tipo',
          cell: (row) => <OrderKindIcon kind={row.order_kind} />,
          card: 'icon',
        },
        {
          header: 'Tipo',
          cell: (row) => <OrderKindBadge kind={row.order_kind} />,
        },
        {
          header: 'Estado',
          cell: (row) => <AllOrderStatusBadge row={row} />,
          card: 'status',
        },
        {
          header: 'Fecha',
          cell: (row) => formatDate(row.created_at),
          className: 'text-muted-foreground',
          hideBelow: 'md',
        },
      ]}
      rowKey={(row) => row.id}
      firstCell="link"
      getRowHref={(row) =>
        row.order_kind === 'key' ? `/llaves/${row.id}` : `/servicio-tecnico/${row.id}`
      }
      groupBy={(row) => monthKey(row.created_at)}
      groupLabel={(key) => formatMonthHeading(key)}
      emptyMessage="No hay órdenes en el historial."
      filteredEmptyMessage="No se encontraron órdenes con los filtros aplicados."
      hasFilters={hasFilters}
    />
  );
}
