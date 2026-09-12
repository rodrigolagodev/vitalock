import { useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { PageHeader } from '@vitalock/ui';
import { useAssignedTickets } from '@/hooks/useAssignedTickets';
import { sortActiveTickets } from '@/lib/status/tareaStatus';
import { ConnectivityBanner } from '@/components/common/ConnectivityBanner';
import { TareasTable } from '@/components/tareas/TareasTable';

/**
 * TareasPage — the installer's full working list.
 *
 * A flat table of tasks (one row per task); each row links to the individual
 * task detail at /tareas/:id (master–detail). Ordering: in-progress first,
 * then by opened date.
 */
export default function TareasPage() {
  const assignedTickets = useAssignedTickets();

  const isLoading = assignedTickets.isLoading && !assignedTickets.data;
  const isFetching = assignedTickets.isFetching;

  const tasks = useMemo(() => assignedTickets.data ?? [], [assignedTickets.data]);

  const sorted = useMemo(() => sortActiveTickets(tasks), [tasks]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Mis tareas" subtitle="Tareas asignadas, en curso primero.">
        {isFetching && !isLoading && (
          <Loader2
            className="text-muted-foreground h-4 w-4 animate-spin"
            aria-label="Actualizando"
          />
        )}
      </PageHeader>

      <ConnectivityBanner />

      <TareasTable rows={sorted} isLoading={isLoading} />
    </div>
  );
}
