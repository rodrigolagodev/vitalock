import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Loader2 } from 'lucide-react';
import { Badge } from '@vitalock/ui';
import { useAssignedTickets } from '@/hooks/useAssignedTickets';
import type { AssignedTicket } from '@/hooks/useAssignedTickets';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/common/EmptyState';
import { ConnectivityBanner } from '@/components/common/ConnectivityBanner';

const statusOrder: Record<AssignedTicket['status'], number> = {
  in_progress: 0,
  open: 1,
};

const statusLabel: Record<AssignedTicket['status'], string> = {
  open: 'Pendiente',
  in_progress: 'En curso',
};

const statusVariant: Record<AssignedTicket['status'], 'default' | 'secondary'> = {
  open: 'default',
  in_progress: 'secondary',
};

function TaskRow({ ticket }: { ticket: AssignedTicket }) {
  const snapshot = ticket.equipmentUpdateSnapshot;
  const hasKeys = !!snapshot && (snapshot.keys_to_activate.length + snapshot.keys_to_disable.length) > 0;

  return (
    <li>
      <Link
        to={`/tareas/${ticket.id}`}
        className="flex items-center gap-2 rounded-md border bg-card px-3 py-2.5 transition-colors hover:bg-muted/50"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-sm font-medium">{ticket.title}</span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            {ticket.building.name && <span className="truncate">{ticket.building.name}</span>}
            {hasKeys && (
              <span className="shrink-0 text-muted-foreground">
                {snapshot!.keys_to_activate.length} alta
                {' / '}
                {snapshot!.keys_to_disable.length} baja
              </span>
            )}
          </span>
        </div>
        <Badge variant={statusVariant[ticket.status]} className="shrink-0">
          {statusLabel[ticket.status]}
        </Badge>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </Link>
    </li>
  );
}

function LoadingSkeletons() {
  return (
    <div className="flex flex-col gap-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-md border p-3 flex flex-col gap-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      ))}
    </div>
  );
}

/**
 * TareasPage — the installer's full working list.
 *
 * Now a flat, scan-friendly list of tasks (one row per task) instead of the
 * old per-building nested-card layout. Each row links to the individual task
 * detail at /tareas/:id (master–detail). Ordering: in-progress first, then
 * by opened date.
 */
export default function TareasPage() {
  const assignedTickets = useAssignedTickets();

  const isLoading = assignedTickets.isLoading && !assignedTickets.data;
  const isFetching = assignedTickets.isFetching;

  const tasks = useMemo(() => assignedTickets.data ?? [], [assignedTickets.data]);

  const sorted = useMemo(
    () =>
      [...tasks].sort((a, b) => {
        const statusDiff = statusOrder[a.status] - statusOrder[b.status];
        if (statusDiff !== 0) return statusDiff;
        return a.opened_at.localeCompare(b.opened_at);
      }),
    [tasks],
  );

  return (
    <div className="flex flex-col gap-4 p-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Mis tareas</h1>
        {isFetching && !isLoading && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Actualizando" />
        )}
      </div>

      <ConnectivityBanner />

      {isLoading ? (
        <LoadingSkeletons />
      ) : sorted.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="flex flex-col gap-2">
          {sorted.map((ticket) => (
            <TaskRow key={ticket.id} ticket={ticket} />
          ))}
        </ul>
      )}
    </div>
  );
}
