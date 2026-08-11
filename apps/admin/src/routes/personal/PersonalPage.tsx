import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PageHeader } from '@/components/layout/PageHeader';
import { usePersonal } from '@/hooks/usePersonal';
import { useDebounce } from '@/hooks/useDebounce';
import { StaffTable } from '@/components/personal/StaffTable';
import { StaffFormSheet } from '@/components/personal/StaffFormSheet';
import type { StaffRow } from '@/hooks/usePersonal';
import type { StaffRole } from '@/hooks/useMutateStaff';

const ALL = 'all';

type RoleFilter = StaffRole | typeof ALL;

export default function PersonalPage() {
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<RoleFilter>(ALL);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<StaffRow | null>(null);

  const debouncedSearch = useDebounce(search, 300);

  const hasFilters = debouncedSearch.trim() !== '' || role !== ALL;

  const { data: staff = [], isFetching, isError } = usePersonal({
    search: debouncedSearch,
    role: role === ALL ? undefined : role,
  });

  if (isError) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-destructive">
          Error al cargar el personal. Recargá la página.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Staff"
        subtitle="Gestioná al equipo y su información."
      >
        <Button onClick={() => setCreateOpen(true)}>Nuevo staff</Button>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Buscar por nombre, email o id..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />

        <Select value={role} onValueChange={(v) => setRole(v as RoleFilter)}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Todos los roles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="installer">Instalador</SelectItem>
          </SelectContent>
        </Select>
      </div>

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
