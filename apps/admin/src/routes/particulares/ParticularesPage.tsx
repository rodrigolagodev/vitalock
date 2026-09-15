import { useState } from 'react';
import { Button, ErrorState, FilterBar } from '@vitalock/ui';
import { PageHeader } from '@vitalock/ui';
import { useParticulares } from '@/hooks/useParticulares';
import { ParticularTable } from '@/components/particulares/ParticularTable';
import { ParticularFormSheet } from '@/components/particulares/ParticularFormSheet';
import type { ParticularRow } from '@/hooks/useParticulares';

export default function ParticularesPage() {
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ParticularRow | null>(null);

  const hasFilters = search.trim() !== '';

  const { data: particulares = [], isFetching, isError } = useParticulares({ search });

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

      <FilterBar>
        <FilterBar.Search
          placeholder="Buscar por nombre o DNI..."
          value={search}
          onChange={setSearch}
          className="max-w-sm"
        />

        <FilterBar.Summary />
      </FilterBar>

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
