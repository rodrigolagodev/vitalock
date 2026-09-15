import { useState } from 'react';
import { Button, ErrorState, FilterBar } from '@vitalock/ui';
import { PageHeader } from '@vitalock/ui';
import { useTareas } from '@/hooks/useTareas';
import { useStaff } from '@/hooks/useStaff';
import { useBuildings } from '@/hooks/useBuildings';
import { TareasTable } from '@/components/tareas/TareasTable';
import { TareaFormSheet } from '@/components/tareas/TareaFormSheet';
import type { TareaRow } from '@/hooks/useTareas';

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'open', label: 'Pendientes' },
  { value: 'in_progress', label: 'En curso' },
  { value: 'resolved', label: 'Finalizadas' },
  { value: 'cancelled', label: 'Canceladas' },
];

export default function TareasPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string[]>([]);
  const [staffId, setStaffId] = useState('');
  const [buildingId, setBuildingId] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<TareaRow | null>(null);

  const hasFilters =
    search.trim() !== '' || status.length > 0 || staffId !== '' || buildingId !== '';

  const { data: staff = [] } = useStaff();
  const { data: buildings = [] } = useBuildings();

  const {
    data: tareas = [],
    isFetching,
    isError,
  } = useTareas({
    search,
    status,
    staffId: staffId || undefined,
    buildingId: buildingId || undefined,
  });

  if (isError) {
    return <ErrorState message="Error al cargar las tareas. Recargá la página." />;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Tareas" subtitle="Gestioná las tareas de mantenimiento e instalación.">
        <Button onClick={() => setCreateOpen(true)}>Nueva tarea</Button>
      </PageHeader>

      <FilterBar>
        <FilterBar.Search
          placeholder="Buscar por número, descripción, edificio o asignado..."
          value={search}
          onChange={setSearch}
          className="max-w-sm"
        />

        <FilterBar.Select
          facet="staff"
          label="Asignado"
          options={[
            { value: '', label: 'Todos los asignados' },
            ...staff.map((s) => ({ value: s.id, label: s.full_name })),
          ]}
          value={staffId}
          onChange={setStaffId}
        />

        <FilterBar.Select
          facet="building"
          label="Edificio"
          options={[
            { value: '', label: 'Todos los edificios' },
            ...buildings.map((b) => ({ value: b.id, label: b.name })),
          ]}
          value={buildingId}
          onChange={setBuildingId}
        />

        <FilterBar.MultiSelect
          facet="status"
          label="Estado"
          options={STATUS_OPTIONS}
          value={status}
          onChange={setStatus}
        />

        <FilterBar.Summary />
      </FilterBar>

      <TareasTable
        rows={tareas}
        isFetching={isFetching}
        hasFilters={hasFilters}
        onEdit={setEditing}
      />

      <TareaFormSheet
        open={createOpen || editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false);
            setEditing(null);
          }
        }}
        tarea={editing}
      />
    </div>
  );
}
