import { useState } from 'react';
import { Input } from '@vitalock/ui';
import { Button } from '@vitalock/ui';
import { useAdministrations } from '@/hooks/useAdministrations';
import { useDebounce } from '@/hooks/useDebounce';
import { AdministrationsTable } from '@/components/administrations/AdministrationsTable';
import { AdministrationFormSheet } from '@/components/administrations/AdministrationFormSheet';
import { PageHeader } from '@/components/layout/PageHeader';

export default function AdministrationsPage() {
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  const debouncedSearch = useDebounce(search, 300);

  const { data: administrations = [], isFetching, isError } = useAdministrations({
    search: debouncedSearch,
  });

  if (isError) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-destructive">
          Error al cargar las administraciones. Recargá la página.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Administraciones"
        subtitle="Gestioná las administraciones y sus edificios."
      >
        <Button onClick={() => setCreateOpen(true)}>Nueva administración</Button>
      </PageHeader>

      <Input
        placeholder="Buscar por razón social o CUIT/CUIL..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      <AdministrationsTable
        administrations={administrations}
        isFetching={isFetching}
        search={debouncedSearch}
      />

      <AdministrationFormSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
    </div>
  );
}
