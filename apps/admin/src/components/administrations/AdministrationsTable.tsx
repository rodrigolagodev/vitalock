import { useState } from 'react';
import { PencilLine } from 'lucide-react';
import { Button, DataCardList } from '@vitalock/ui';
import { administrationStatus } from '@/lib/status/administrationStatus';
import { AdministrationFormSheet } from './AdministrationFormSheet';
import { AdministrationStatusToggle } from './AdministrationStatusToggle';
import type { AdministrationRow } from '@/hooks/useAdministrations';

interface AdministrationsTableProps {
  administrations: AdministrationRow[];
  isFetching: boolean;
  search?: string;
}

export function AdministrationsTable({
  administrations,
  isFetching,
  search = '',
}: AdministrationsTableProps) {
  const [editingAdmin, setEditingAdmin] = useState<AdministrationRow | null>(null);

  return (
    <>
      <DataCardList<AdministrationRow>
        rows={administrations}
        isFetching={isFetching}
        columns={[
          { header: 'Razón social', cell: (admin) => admin.company_name },
          {
            header: 'CUIT/CUIL',
            cell: (admin) => admin.tax_id ?? '—',
            hideBelow: 'md',
          },
          {
            header: 'Dirección',
            cell: (admin) => admin.address ?? '—',
            hideBelow: 'md',
          },
          {
            header: 'Estado',
            cell: (admin) => <administrationStatus.Badge status={admin.status} />,
            card: 'status',
          },
        ]}
        rowKey={(admin) => admin.id}
        firstCell="link"
        getRowHref={(admin) => `/administraciones/${admin.id}`}
        emptyMessage="No hay administraciones registradas."
        hasFilters={search !== ''}
        filteredEmptyMessage={`No se encontraron resultados para \u201C${search}\u201D.`}
        renderActions={(admin) => (
          <div className="flex w-full items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1 gap-2"
              aria-label={`Editar a ${admin.company_name}`}
              onClick={() => setEditingAdmin(admin)}
            >
              <PencilLine className="h-4 w-4" />
              Editar
            </Button>
            <AdministrationStatusToggle administration={admin} />
          </div>
        )}
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
