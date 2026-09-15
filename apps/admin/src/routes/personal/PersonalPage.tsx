import { useState } from 'react';
import { Button, ErrorState, FilterBar } from '@vitalock/ui';
import { PageHeader } from '@vitalock/ui';
import { usePersonal } from '@/hooks/usePersonal';
import { StaffTable } from '@/components/personal/StaffTable';
import { StaffFormSheet } from '@/components/personal/StaffFormSheet';
import type { StaffRow } from '@/hooks/usePersonal';
import type { StaffRole } from '@/hooks/useMutateStaff';

const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Todos' },
  { value: 'admin', label: 'Admin' },
  { value: 'installer', label: 'Instalador' },
];

export default function PersonalPage() {
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<StaffRow | null>(null);

  const hasFilters = search.trim() !== '' || role !== '';

  const {
    data: staff = [],
    isFetching,
    isError,
  } = usePersonal({
    search,
    role: role === '' ? undefined : (role as StaffRole),
  });

  if (isError) {
    return <ErrorState message="Error al cargar el personal. Recargá la página." />;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Personal" subtitle="Gestioná al equipo y su información.">
        <Button onClick={() => setCreateOpen(true)}>Nuevo integrante</Button>
      </PageHeader>

      <FilterBar>
        <FilterBar.Search
          placeholder="Buscar por nombre, email o id..."
          value={search}
          onChange={setSearch}
          className="max-w-sm"
        />

        <FilterBar.Select
          facet="role"
          label="Rol"
          options={ROLE_OPTIONS}
          value={role}
          onChange={setRole}
        />

        <FilterBar.Summary />
      </FilterBar>

      <StaffTable
        rows={staff}
        isFetching={isFetching}
        hasFilters={hasFilters}
        onEdit={setEditing}
      />

      <StaffFormSheet
        open={createOpen || editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false);
            setEditing(null);
          }
        }}
        staff={editing}
      />
    </div>
  );
}
