import { useState } from 'react';
import { Button, ErrorState, SearchInput } from '@vitalock/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { useParticulares } from '@/hooks/useParticulares';
import { useDebounce } from '@/hooks/useDebounce';
import { ParticularTable } from '@/components/particulares/ParticularTable';
import { ParticularFormSheet } from '@/components/particulares/ParticularFormSheet';
import type { ParticularRow } from '@/hooks/useParticulares';

export default function ParticularesPage() {
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ParticularRow | null>(null);

  const debouncedSearch = useDebounce(search, 300);

  const hasFilters = debouncedSearch.trim() !== '';

  const {
    data: particulares = [],
    isFetching,
    isError,
  } = useParticulares({ search: debouncedSearch });

  if (isError) {
    return <ErrorState message="Error al cargar los particulares. Recargá la página." />;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Particulares"
        subtitle="Gestioná los particulares (propietarios que compran directo)."
      >
        <Button onClick={() => setCreateOpen(true)}>Nuevo particular</Button>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          placeholder="Buscar por nombre o DNI..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>

      <ParticularTable
        rows={particulares}
        isFetching={isFetching}
        hasFilters={hasFilters}
        onEdit={setEditing}
      />

      <ParticularFormSheet
        open={createOpen || editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false);
            setEditing(null);
          }
        }}
        particular={editing}
      />
    </div>
  );
}
