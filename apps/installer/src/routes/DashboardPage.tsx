import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronRight, ListTodo, Loader2 } from 'lucide-react';
import { Badge, Button, StatCard } from '@vitalock/ui';
import { useAuthContext } from '@vitalock/shared';
import { useAssignedTickets } from '@/hooks/useAssignedTickets';
import type { AssignedTicket } from '@/hooks/useAssignedTickets';

const QUICK_ACCESS_LIMIT = 5;

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

function firstName(fullName: string | undefined | null): string {
  if (!fullName) return '';
  const [first] = fullName.trim().split(/\s+/);
  return first ?? '';
}

/**
 * DashboardPage — the installer's home screen.
 *
 * Header greeting + pending-task StatCard + a short list of the next few
 * tasks with a "Ver todas" link to the full Tareas view. All numbers come
 * from useAssignedTickets so counts stay in sync with the live worklist.
 */
export default function DashboardPage() {
  const { staff } = useAuthContext();
  const assignedTickets = useAssignedTickets();

  const tickets = useMemo(() => assignedTickets.data ?? [], [assignedTickets.data]);

  const sorted = useMemo(
    () =>
      [...tickets].sort((a, b) => {
        const statusDiff = statusOrder[a.status] - statusOrder[b.status];
        if (statusDiff !== 0) return statusDiff;
        return a.opened_at.localeCompare(b.opened_at);
      }),
    [tickets],
  );

  const quickAccess = sorted.slice(0, QUICK_ACCESS_LIMIT);
  const remaining = Math.max(sorted.length - quickAccess.length, 0);

  const greetingName = firstName(staff?.full_name);
  const greeting = greetingName ? `Hola, ${greetingName}` : 'Hola';

  const isLoading = assignedTickets.isLoading && !assignedTickets.data;

  return (
    <div className="flex flex-col gap-6 p-4 max-w-2xl mx-auto">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{greeting}</h1>
          <p className="text-sm text-muted-foreground">Resumen de tu jornada</p>
        </div>
        {assignedTickets.isFetching && !isLoading && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Actualizando" />
        )}
      </header>

      <StatCard
        label="Tareas pendientes"
        value={isLoading ? '…' : tickets.length}
        icon={<ListTodo className="h-5 w-5" />}
      />

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Acceso rápido
          </h2>
          {sorted.length > 0 && (
            <Button asChild variant="ghost" size="sm" className="h-8 gap-1 px-2 text-xs">
              <Link to="/tareas">
                Ver todas
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          )}
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando tareas…</p>
        ) : quickAccess.length === 0 ? (
          <p className="rounded-md border bg-card p-4 text-sm text-muted-foreground">
            No tenés tareas pendientes. ¡Buen trabajo!
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {quickAccess.map((ticket) => (
              <li key={ticket.id}>
                <Link
                  to="/tareas"
                  className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 transition-colors hover:bg-muted/50"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-sm font-medium">{ticket.title}</span>
                    {ticket.building.name && (
                      <span className="truncate text-xs text-muted-foreground">
                        {ticket.building.name}
                      </span>
                    )}
                  </div>
                  <Badge variant={statusVariant[ticket.status]} className="shrink-0">
                    {statusLabel[ticket.status]}
                  </Badge>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
            {remaining > 0 && (
              <li className="text-center text-xs text-muted-foreground">
                +{remaining} {remaining === 1 ? 'tarea más' : 'tareas más'}
              </li>
            )}
          </ul>
        )}
      </section>
    </div>
  );
}
