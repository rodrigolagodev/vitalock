import { DataTable, Badge } from '@vitalock/ui';
import { formatCurrency, formatDateTime } from '@/lib/format';
import { CATEGORY_LABELS } from './ProductFormFields';
import type { ProductRow } from '@/types/stock';

interface ProductsTableProps {
  rows: ProductRow[];
  isFetching: boolean;
  hasFilters?: boolean;
}

export function ProductsTable({ rows, isFetching, hasFilters = false }: ProductsTableProps) {
  return (
    <DataTable<ProductRow>
      rows={rows}
      isFetching={isFetching}
      columns={[
        { header: 'Nombre', cell: (product) => product.name },
        {
          header: 'Categoría',
          cell: (product) => (
            <Badge variant="secondary">{CATEGORY_LABELS[product.category]}</Badge>
          ),
        },
        {
          header: 'Precio de costo',
          cell: (product) => formatCurrency(product.cost_price),
          className: 'text-muted-foreground',
        },
        { header: 'Stock total', cell: (product) => product.stock_total },
        {
          header: 'Reservado',
          cell: (product) => product.stock_reservado,
          className: 'text-muted-foreground',
        },
        {
          header: 'Disponible',
          cell: (product) => (
            <span
              className={
                product.stock_disponible < 0
                  ? 'font-medium text-destructive'
                  : 'font-medium'
              }
            >
              {product.stock_disponible}
            </span>
          ),
        },
        {
          header: 'Actualizado',
          cell: (product) => formatDateTime(product.updated_at),
          className: 'text-muted-foreground',
        },
      ]}
      rowKey={(product) => product.id}
      firstCell="link"
      getRowHref={(product) => `/stock/${product.id}`}
      emptyMessage="No hay productos cargados."
      filteredEmptyMessage="No se encontraron productos con los filtros aplicados."
      hasFilters={hasFilters}
    />
  );
}
