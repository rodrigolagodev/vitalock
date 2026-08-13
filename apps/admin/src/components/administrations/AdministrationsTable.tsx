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
import { Badge } from '@vitalock/ui';
import { Button } from '@vitalock/ui';
import { DEFAULT_PAGE_SIZE, PaginationFooter, getPageSlice } from '@vitalock/ui';
import { AdministrationFormSheet } from './AdministrationFormSheet';
import { AdministrationStatusToggle } from './AdministrationStatusToggle';
import type { AdministrationRow } from '@/hooks/useAdministrations';

interface AdministrationsTableProps {
  administrations: AdministrationRow[];
  isFetching: boolean;
  search?: string;
}

function SkeletonRow() {
  return (
    <TableRow>
      <TableCell><div className="h-4 w-40 animate-pulse rounded-md bg-muted" /></TableCell>
      <TableCell><div className="h-4 w-28 animate-pulse rounded-md bg-muted" /></TableCell>
      <TableCell><div className="h-5 w-16 animate-pulse rounded-md bg-muted" /></TableCell>
      <TableCell className="text-right"><div className="ml-auto h-8 w-24 animate-pulse rounded-md bg-muted" /></TableCell>
    </TableRow>
  );
}

export function AdministrationsTable({
  administrations,
  isFetching,
  search = '',
}: AdministrationsTableProps) {
  const [editingAdmin, setEditingAdmin] = useState<AdministrationRow | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  // New filtered dataset (search change) → back to page 1 at the default size.
  useEffect(() => {
    setPage(1);
    setPageSize(DEFAULT_PAGE_SIZE);
  }, [administrations]);

  if (isFetching) {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Razón social</TableHead>
            <TableHead>CUIT/CUIL</TableHead>
            <TableHead>Estado</TableHead>
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

  if (administrations.length === 0 && search === '') {
    return (
      <div className="flex flex-col items-center justify-center rounded-md border border-dashed py-12 text-center">
        <p className="text-sm text-muted-foreground">No hay administraciones registradas.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Usá el botón "Nueva administración" para agregar la primera.
        </p>
      </div>
    );
  }

  if (administrations.length === 0 && search !== '') {
    return (
      <div className="flex flex-col items-center justify-center rounded-md border border-dashed py-12 text-center">
        <p className="text-sm text-muted-foreground">
          No se encontraron resultados para &ldquo;{search}&rdquo;.
        </p>
      </div>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Razón social</TableHead>
            <TableHead>CUIT/CUIL</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {getPageSlice(administrations, page, pageSize).map((admin) => (
            <TableRow key={admin.id}>
              <TableCell className="font-medium">
                <Link
                  to={`/administraciones/${admin.id}`}
                  className="hover:underline"
                >
                  {admin.company_name}
                </Link>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {admin.tax_id ?? '—'}
              </TableCell>
              <TableCell>
                <Badge
                  variant={admin.status === 'active' ? 'default' : 'secondary'}
                >
                  {admin.status === 'active' ? 'Activa' : 'Inactiva'}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingAdmin(admin)}
                  >
                    Editar
                  </Button>
                  <AdministrationStatusToggle administration={admin} />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <PaginationFooter
        total={administrations.length}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />

      <AdministrationFormSheet
        open={Boolean(editingAdmin)}
        onOpenChange={(open) => {
          if (!open) setEditingAdmin(null);
        }}
        administration={editingAdmin}
      />
    </>
  );
}
