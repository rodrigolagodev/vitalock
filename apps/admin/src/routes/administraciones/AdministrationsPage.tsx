import { useState } from 'react';
import { Building2, CircleCheck } from 'lucide-react';
import { Button, ErrorState, SearchInput, StatCard } from '@vitalock/ui';
import { useAdministrations } from '@/hooks/useAdministrations';
import { useDebounce } from '@/hooks/useDebounce';
import { AdministrationsTable } from '@/components/administrations/AdministrationsTable';
import { AdministrationFormSheet } from '@/components/administrations/AdministrationFormSheet';
import { ACTIVE_STATUS } from '@/lib/statThresholds';
import { PageHeader } from '@/components/layout/PageHeader';

export default function AdministrationsPage() {
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  const debouncedSearch = useDebounce(search, 300);

  const { data: administrations = [], isFetching, isError } = useAdministrations({
    search: debouncedSearch,
  });

  if (isError) {
    return <ErrorState message="Error al cargar las administraciones. Recargá la página." />;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Administraciones"
        subtitle="Gestioná las administraciones y sus edificios."
      >
        <Button onClick={() => setCreateOpen(true)}>Nueva administración</Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2" data-testid="stat-cards">
        <StatCard
          label="Total administraciones"
          value={String(administrations.length)}
          icon={<Building2 />}
        />
        <StatCard
          label="Activas"
          value={String(
            administrations.filter(
              (administration) => administration.status === ACTIVE_STATUS,
            ).length,
          )}
          icon={<CircleCheck />}
        />
      </div>

      <SearchInput
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
