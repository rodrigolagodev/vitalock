import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { EmptyState, Label, PageHeader, SectionHeading, Skeleton, cn } from '@vitalock/ui';
import { useTicketHistory } from '@/hooks/useTicketHistory';
import { tareaStatus } from '@/lib/status/tareaStatus';
import type { HistoricalTicket } from '@/hooks/useTicketHistory';

type StatusFilter = 'all' | 'resolved' | 'cancelled';

/**
 * Native `<select>` styled like the shared `Input`. Kept native (not the
 * Radix `Select`) so it works with the OS picker on phones and stays
 * keyboard/AT-friendly on flaky field connections.
 */
const NATIVE_SELECT_CLASS = cn(
  'flex h-11 w-full min-w-40 rounded-lg border border-input bg-card px-3 py-2 text-base text-foreground',
  'ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
  'disabled:cursor-not-allowed disabled:opacity-50',
);

function formatDayHeading(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function LoadingSkeletons() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Cargando historial">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  );
}

/**
 * HistorialPage — installer's timeline of closed tasks.
 *
 * Shows resolved + cancelled tickets grouped by close day, most recent
 * first. Filters by status and by building let the installer narrow the
 * view when the history grows. Each title links to the read-only task
 * detail at /tareas/:id.
 */
export default function HistorialPage() {
  const { data, isLoading, isFetching } = useTicketHistory();
  const tickets = useMemo(() => data ?? [], [data]);

  const [status, setStatus] = useState<StatusFilter>('all');
  const [buildingId, setBuildingId] = useState<string>('all');

  const buildingOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of tickets) {
      if (t.building.id) map.set(t.building.id, t.building.name);
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [tickets]);

  const filtered = useMemo(
    () =>
      tickets.filter((t) => {
        if (status !== 'all' && t.status !== status) return false;
        if (buildingId !== 'all' && t.building.id !== buildingId) return false;
        return true;
      }),
    [tickets, status, buildingId],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, HistoricalTicket[]>();
    for (const t of filtered) {
      const key = dayKey(t.closed_at);
      const list = map.get(key) ?? [];
      list.push(t);
      map.set(key, list);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Historial" subtitle="Tareas cerradas">
        {isFetching && !isLoading && (
          <Loader2
            className="text-muted-foreground h-4 w-4 animate-spin"
            aria-label="Actualizando"
          />
        )}
      </PageHeader>

      <div className="flex flex-wrap items-center gap-4" aria-label="Filtros">
        <div className="flex items-center gap-2">
          <Label htmlFor="historial-status" className="text-muted-foreground text-xs uppercase">
            Estado
          </Label>
          <select
            id="historial-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            className={NATIVE_SELECT_CLASS}
          >
            <option value="all">Todas</option>
            <option value="resolved">Resueltas</option>
            <option value="cancelled">Canceladas</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <Label htmlFor="historial-building" className="text-muted-foreground text-xs uppercase">
            Edificio
          </Label>
          <select
            id="historial-building"
            value={buildingId}
            onChange={(e) => setBuildingId(e.target.value)}
            className={NATIVE_SELECT_CLASS}
          >
            <option value="all">Todos</option>
            {buildingOptions.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <LoadingSkeletons />
      ) : grouped.length === 0 ? (
        <EmptyState
          className="bg-card rounded-md border p-4"
          message={
            tickets.length === 0
              ? 'Todavía no tenés tareas cerradas.'
              : 'No hay tareas con esos filtros.'
          }
        />
      ) : (
        <div className="flex flex-col gap-6">
          {grouped.map(([day, items]) => (
            <section key={day} className="flex flex-col gap-3">
              <SectionHeading title={formatDayHeading(day)} variant="secondary" />
              <ul className="bg-card divide-y rounded-md border">
                {items.map((t) => (
                  <li key={t.id} className="flex flex-col gap-1 px-4 py-3">
                    <div className="flex items-start gap-3">
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <Link
                          to={`/tareas/${t.id}`}
                          className="truncate text-sm font-medium underline-offset-4 hover:underline focus-visible:underline"
                        >
                          {t.title}
                        </Link>
                        {t.building.name && (
                          <span className="text-muted-foreground truncate text-xs">
                            {t.building.name}
                            {t.building.administration.company_name
                              ? ` · ${t.building.administration.company_name}`
                              : ''}
                          </span>
                        )}
                      </div>
                      <tareaStatus.Badge status={t.status} />
                    </div>
                    <span className="text-muted-foreground text-xs">{formatTime(t.closed_at)}</span>
                    {t.status === 'resolved' && t.resolution_notes && (
                      <p className="text-muted-foreground text-xs">{t.resolution_notes}</p>
                    )}
                    {t.status === 'cancelled' && t.cancellation_reason && (
                      <p className="text-muted-foreground text-xs">{t.cancellation_reason}</p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
