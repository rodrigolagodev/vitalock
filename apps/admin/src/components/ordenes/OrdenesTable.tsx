import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge, DEFAULT_PAGE_SIZE, PaginationFooter, getPageSlice } from '@vitalock/ui';
import { OrdenStatusBadge } from './OrdenStatusBadge';
import type { OrdenRow, OrderType } from '@/hooks/useOrdens';

const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  keys: 'Llaves',
  technical: 'Servicio técnico',
};

interface OrdenesTableProps {
  ordenes: OrdenRow[];
  isFetching: boolean;
  hasFilters?: boolean;
}

function SkeletonRow() {
  return (
    <TableRow>
      <TableCell><div className="h-4 w-28 animate-pulse rounded-md bg-muted" /></TableCell>
      <TableCell><div className="h-4 w-16 animate-pulse rounded-md bg-muted" /></TableCell>
      <TableCell><div className="h-4 w-40 animate-pulse rounded-md bg-muted" /></TableCell>
      <TableCell><div className="h-4 w-12 animate-pulse rounded-md bg-muted" /></TableCell>
      <TableCell><div className="h-5 w-28 animate-pulse rounded-md bg-muted" /></TableCell>
      <TableCell><div className="h-4 w-24 animate-pulse rounded-md bg-muted" /></TableCell>
    </TableRow>
  );
}

function clientLabel(orden: OrdenRow): string {
  if (orden.client_type === 'administration') {
    return orden.administrations?.company_name ?? '—';
  }
  return orden.particular_full_name ?? '—';
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function OrdenesTable({
  ordenes,
  isFetching,
  hasFilters = false,
}: OrdenesTableProps) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  // New filtered dataset (search/status/type change) → back to page 1 at the default size.
  useEffect(() => {
    setPage(1);
    setPageSize(DEFAULT_PAGE_SIZE);
  }, [ordenes]);

  if (isFetching) {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>N.º de orden</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Ítems</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Fecha</TableHead>
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

  if (ordenes.length === 0 && !hasFilters) {
    return (
      <div className="flex flex-col items-center justify-center rounded-md border border-dashed py-12 text-center">
        <p className="text-sm text-muted-foreground">No hay órdenes registradas.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Usá el botón "Nueva orden" para crear la primera.
        </p>
      </div>
    );
  }

  if (ordenes.length === 0 && hasFilters) {
    return (
      <div className="flex flex-col items-center justify-center rounded-md border border-dashed py-12 text-center">
        <p className="text-sm text-muted-foreground">
          No se encontraron órdenes con los filtros aplicados.
        </p>
      </div>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>N.º de orden</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Ítems</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Fecha</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {getPageSlice(ordenes, page, pageSize).map((orden) => (
            <TableRow key={orden.id}>
              <TableCell className="font-medium">
                <Link
                  to={`/ordenes/${orden.id}`}
                  className="hover:underline"
                >
                  {orden.order_number}
                </Link>
              </TableCell>
              <TableCell>
                <Badge variant="outline">
                  {ORDER_TYPE_LABELS[orden.order_type]}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {clientLabel(orden)}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {orden.order_items.length}
              </TableCell>
              <TableCell>
                <OrdenStatusBadge status={orden.status} />
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatDate(orden.created_at)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <PaginationFooter
        total={ordenes.length}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />
    </>
  );
}
