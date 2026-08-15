import { DataTable } from '@vitalock/ui';
import { CATEGORY_LABELS } from './categoryLabels';
import type { OrderItemRow } from '@/hooks/useOrden';

interface TechnicalItemsTableProps {
  items: OrderItemRow[];
  /** Loading state — renders the DataTable pulse skeleton. */
  isFetching?: boolean;
}

/**
 * Technical order items (non-key orders): minimal read-only table with no
 * key-specific actions. First cell is plain text per the per-table contract
 * (no navigation target exists for a technical order item).
 */
export function TechnicalItemsTable({ items, isFetching = false }: TechnicalItemsTableProps) {
  return (
    <DataTable<OrderItemRow>
      rows={items}
      isFetching={isFetching}
      columns={[
        { header: 'Tipo', cell: (item) => CATEGORY_LABELS[item.item_type] ?? item.item_type },
        {
          header: 'Descripción',
          cell: (item) => item.description ?? '—',
          className: 'text-muted-foreground',
        },
        { header: 'Cantidad', cell: (item) => item.quantity, className: 'text-right' },
      ]}
      rowKey={(item) => item.id}
      emptyMessage="Sin ítems"
    />
  );
}
