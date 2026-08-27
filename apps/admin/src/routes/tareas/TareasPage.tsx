import { useState } from 'react';
import { Input } from '@vitalock/ui';
import { Button } from '@vitalock/ui';
import { Badge } from '@vitalock/ui';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PageHeader } from '@/components/layout/PageHeader';
import { useTareas } from '@/hooks/useTareas';
import { useStaff } from '@/hooks/useStaff';
import { useBuildings } from '@/hooks/useBuildings';
import { useDebounce } from '@/hooks/useDebounce';
import { TareasTable } from '@/components/tareas/TareasTable';
import { TareaFormSheet } from '@/components/tareas/TareaFormSheet';
import type { TareaRow } from '@/hooks/useTareas';

type StatusFilter = 'all' | 'open' | 'in_progress' | 'resolved' | 'cancelled';

const STATUS_PILLS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'open', label: 'Pendientes' },
  { value: 'in_progress', label: 'En curso' },
  { value: 'resolved', label: 'Finalizadas' },
  { value: 'cancelled', label: 'Canceladas' },
];

const ALL = 'all';

export default function TareasPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [staffId, setStaffId] = useState('');
  const [buildingId, setBuildingId] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<TareaRow | null>(null);

  const debouncedSearch = useDebounce(search, 300);

  const hasFilters =
    debouncedSearch.trim() !== '' ||
    status !== 'all' ||
    staffId !== '' ||
    buildingId !== '';

  const { data: staff = [] } = useStaff();
  const { data: buildings = [] } = useBuildings();

  const { data: tareas = [], isFetching, isError } = useTareas({
    search: debouncedSearch,
    status: status === 'all' ? undefined : status,
    staffId: staffId || undefined,
    buildingId: buildingId || undefined,
  });

  if (isError) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-destructive">
          Error al cargar las tareas. Recargá la página.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Tareas"
        subtitle="Gestioná las tareas de mantenimiento e instalación."
      >
        <Button onClick={() => setCreateOpen(true)}>Nueva tarea</Button>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Buscar por número, descripción, edificio o asignado..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />

        <Select
          value={staffId || ALL}
          onValueChange={(v) => setStaffId(v === ALL ? '' : v)}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Todos los asignados" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos los asignados</SelectItem>
            {staff.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={buildingId || ALL}
          onValueChange={(v) => setBuildingId(v === ALL ? '' : v)}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Todos los edificios" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos los edificios</SelectItem>
            {buildings.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_PILLS.map((pill) => (
          <button
            key={pill.value}
            type="button"
            onClick={() => setStatus(pill.value)}
          >
            <Badge
              variant={status === pill.value ? 'default' : 'secondary'}
              className="cursor-pointer"
            >
              {pill.label}
            </Badge>
          </button>
        ))}
      </div>

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
