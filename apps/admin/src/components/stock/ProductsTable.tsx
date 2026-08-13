import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@vitalock/ui';
import { Badge } from '@vitalock/ui';
import { DEFAULT_PAGE_SIZE, PaginationFooter, getPageSlice } from '@vitalock/ui';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CATEGORY_LABELS } from './ProductFormFields';
import type { ProductRow } from '@/types/stock';

interface ProductsTableProps {
  rows: ProductRow[];
  isFetching: boolean;
  hasFilters?: boolean;
}

function formatCost(value: number | null): string {
  if (value == null) return '—';
  return value.toLocaleString('es-AR', {
    style: 'currency',
    currency: 'ARS',
  });
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' });
}

function SkeletonRow() {
  return (
    <TableRow>
      <TableCell><div className="h-4 w-40 animate-pulse rounded-md bg-muted" /></TableCell>
      <TableCell><div className="h-5 w-24 animate-pulse rounded-md bg-muted" /></TableCell>
      <TableCell><div className="h-4 w-24 animate-pulse rounded-md bg-muted" /></TableCell>
      <TableCell><div className="h-4 w-16 animate-pulse rounded-md bg-muted" /></TableCell>
      <TableCell><div className="h-4 w-16 animate-pulse rounded-md bg-muted" /></TableCell>
      <TableCell><div className="h-4 w-16 animate-pulse rounded-md bg-muted" /></TableCell>
      <TableCell><div className="h-4 w-28 animate-pulse rounded-md bg-muted" /></TableCell>
      <TableCell className="text-right"><div className="h-4 w-12 animate-pulse rounded-md bg-muted" /></TableCell>
    </TableRow>
  );
}

export function ProductsTable({ rows, isFetching, hasFilters = false }: ProductsTableProps) {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  // New filtered dataset (search/category change) → back to page 1 at the default size.
  useEffect(() => {
    setPage(1);
    setPageSize(DEFAULT_PAGE_SIZE);
  }, [rows]);

  const goToDetail = (product: ProductRow) => navigate(`/stock/${product.id}`);

  if (isFetching) {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Categoría</TableHead>
            <TableHead>Precio de costo</TableHead>
            <TableHead>Stock total</TableHead>
            <TableHead>Reservado</TableHead>
            <TableHead>Disponible</TableHead>
            <TableHead>Actualizado</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
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
        <p className="text-sm text-muted-foreground">No hay productos cargados.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Usá el botón &quot;Cargar producto&quot;.
        </p>
      </div>
    );
  }

  if (rows.length === 0 && hasFilters) {
    return (
      <div className="flex flex-col items-center justify-center rounded-md border border-dashed py-12 text-center">
        <p className="text-sm text-muted-foreground">
          No se encontraron productos con los filtros aplicados.
        </p>
      </div>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Categoría</TableHead>
            <TableHead>Precio de costo</TableHead>
            <TableHead>Stock total</TableHead>
            <TableHead>Reservado</TableHead>
            <TableHead>Disponible</TableHead>
            <TableHead>Actualizado</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {getPageSlice(rows, page, pageSize).map((product) => {
            const lowStock = product.stock_disponible < 0;
            return (
              <TableRow
                key={product.id}
                role="button"
                tabIndex={0}
                className="cursor-pointer"
                onClick={() => goToDetail(product)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    goToDetail(product);
                  }
                }}
              >
                <TableCell className="font-medium">{product.name}</TableCell>
                <TableCell>
                  <Badge variant="secondary">
                    {CATEGORY_LABELS[product.category]}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatCost(product.cost_price)}
                </TableCell>
                <TableCell>{product.stock_total}</TableCell>
                <TableCell className="text-muted-foreground">
                  {product.stock_reservado}
                </TableCell>
                <TableCell
                  className={
                    lowStock ? 'font-medium text-destructive' : 'font-medium'
                  }
                >
                  {product.stock_disponible}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDateTime(product.updated_at)}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      goToDetail(product);
                    }}
                  >
                    Ver
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <PaginationFooter
        total={rows.length}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />
    </>
  );
}
