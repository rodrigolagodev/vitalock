import { useState } from 'react';
import { PencilLine } from 'lucide-react';
import { DataTable, IconButton } from '@vitalock/ui';
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
      <DataTable<AdministrationRow>
        rows={administrations}
        isFetching={isFetching}
        columns={[
          { header: 'Razón social', cell: (admin) => admin.company_name },
          {
            header: 'CUIT/CUIL',
            cell: (admin) => <span className="text-muted-foreground">{admin.tax_id ?? '—'}</span>,
            hideBelow: 'md',
          },
          {
            header: 'Estado',
            cell: (admin) => <administrationStatus.Badge status={admin.status} />,
          },
        ]}
        rowKey={(admin) => admin.id}
        firstCell="link"
        getRowHref={(admin) => `/administraciones/${admin.id}`}
        emptyMessage="No hay administraciones registradas."
        hasFilters={search !== ''}
        filteredEmptyMessage={`No se encontraron resultados para \u201C${search}\u201D.`}
        renderActions={(admin) => (
          <div className="flex items-center justify-end gap-1">
            <IconButton
              icon={PencilLine}
              label={`Editar a ${admin.company_name}`}
              onClick={() => setEditingAdmin(admin)}
            />
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
