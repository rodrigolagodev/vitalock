import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Building2, ChevronRight, ListTodo, Loader2, Wrench } from 'lucide-react';
import {
  Button,
  EmptyState,
  ErrorState,
  PageHeader,
  SectionHeading,
  Skeleton,
  StatCard,
} from '@vitalock/ui';
import { useAuthContext } from '@vitalock/shared';
import { useAssignedTickets } from '@/hooks/useAssignedTickets';
import { sortActiveTickets, tareaStatus } from '@/lib/status/tareaStatus';

const QUICK_ACCESS_LIMIT = 5;

function firstName(fullName: string | undefined | null): string {
  if (!fullName) return '';
  const [first] = fullName.trim().split(/\s+/);
  return first ?? '';
}

/** Placeholder laid out like the loaded page: stat row plus quick-access cards. */
function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Cargando">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <Skeleton className="h-16" />
    </div>
  );
}

/**
 * DashboardPage — the installer's home screen.
 *
 * Greeting header + StatCard snapshot row + a short "Acceso rápido" list of
 * the next few tasks with a "Ver todas" link to the full Tareas view. All
 * numbers come from useAssignedTickets so counts stay in sync with the live
 * worklist.
 */
export default function DashboardPage() {
  const { staff } = useAuthContext();
  const assignedTickets = useAssignedTickets();

  const tickets = useMemo(() => assignedTickets.data ?? [], [assignedTickets.data]);
  const sorted = useMemo(() => sortActiveTickets(tickets), [tickets]);

  const inProgressCount = tickets.filter((t) => t.status === 'in_progress').length;
  const buildingCount = new Set(tickets.map((t) => t.building.id)).size;

  const quickAccess = sorted.slice(0, QUICK_ACCESS_LIMIT);
  const remaining = Math.max(sorted.length - quickAccess.length, 0);

  const greetingName = firstName(staff?.full_name);
  const greeting = greetingName ? `Hola, ${greetingName}` : 'Hola';

  const isLoading = assignedTickets.isLoading && !assignedTickets.data;
  const showError = assignedTickets.isError && !assignedTickets.data;

  return (
    <div className="flex flex-col gap-6 pb-6">
      <PageHeader title={greeting} titleSize="large-title" subtitle="Resumen de tu jornada">
        {assignedTickets.isFetching && !isLoading && (
          <Loader2
            className="text-muted-foreground h-4 w-4 animate-spin"
            aria-label="Actualizando"
          />
        )}
      </PageHeader>

      {isLoading ? (
        <DashboardSkeleton />
      ) : showError ? (
        <ErrorState
          message="No se pudieron cargar las tareas."
          onRetry={() => void assignedTickets.refetch()}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              label="Tareas pendientes"
              value={tickets.length}
              icon={<ListTodo className="h-5 w-5" />}
            />
            <StatCard
              label="En curso"
              value={inProgressCount}
              icon={<Wrench className="h-5 w-5" />}
            />
            <StatCard
              label="Edificios"
              value={buildingCount}
              icon={<Building2 className="h-5 w-5" />}
            />
          </div>

          <section className="flex flex-col gap-3">
            <SectionHeading title="Acceso rápido">
              {sorted.length > 0 && (
                <Button asChild variant="ghost" className="gap-1">
                  <Link to="/tareas">
                    Ver todas
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              )}
            </SectionHeading>

            {quickAccess.length === 0 ? (
              <EmptyState
                message="No tenés tareas pendientes. ¡Buen trabajo!"
                className="bg-card rounded-md border p-4"
              />
            ) : (
              <div className="flex flex-col gap-2">
                <ul className="bg-card divide-y rounded-md border">
                  {quickAccess.map((ticket) => (
                    <li key={ticket.id}>
                      <Link
                        to={`/tareas/${ticket.id}`}
                        className="hover:bg-muted/50 flex items-center gap-3 px-4 py-3 transition-colors"
                      >
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="truncate text-sm font-medium">{ticket.title}</span>
                          {ticket.building.name && (
                            <span className="text-muted-foreground truncate text-xs">
                              {ticket.building.name}
                            </span>
                          )}
                        </div>
                        <tareaStatus.Badge status={ticket.status} />
                        <ChevronRight className="text-muted-foreground h-4 w-4 shrink-0" />
                      </Link>
                    </li>
                  ))}
                </ul>
                {remaining > 0 && (
                  <p className="text-muted-foreground text-center text-xs">
                    +{remaining} {remaining === 1 ? 'tarea más' : 'tareas más'}
                  </p>
                )}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
