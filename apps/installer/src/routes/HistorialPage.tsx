import { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Badge } from '@vitalock/ui';
import { useTicketHistory } from '@/hooks/useTicketHistory';
import type { HistoricalTicket } from '@/hooks/useTicketHistory';

type StatusFilter = 'all' | 'resolved' | 'cancelled';

const statusLabel: Record<HistoricalTicket['status'], string> = {
  resolved: 'Resuelta',
  cancelled: 'Cancelada',
};

const statusVariant: Record<HistoricalTicket['status'], 'default' | 'secondary'> = {
  resolved: 'default',
  cancelled: 'secondary',
};

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

/**
 * HistorialPage — installer's timeline of closed tasks.
 *
 * Shows resolved + cancelled tickets grouped by close day, most recent
 * first. Filters by status and by building let the installer narrow the
 * view when the history grows.
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
    <div className="flex flex-col gap-4 p-4 max-w-2xl mx-auto">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Historial</h1>
          <p className="text-sm text-muted-foreground">Tareas cerradas</p>
        </div>
        {isFetching && !isLoading && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Actualizando" />
        )}
      </header>

      <section className="flex flex-wrap gap-2" aria-label="Filtros">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          <span>Estado</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            className="h-9 rounded-md border bg-card px-2 text-sm text-foreground"
          >
            <option value="all">Todas</option>
            <option value="resolved">Resueltas</option>
            <option value="cancelled">Canceladas</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          <span>Edificio</span>
          <select
            value={buildingId}
            onChange={(e) => setBuildingId(e.target.value)}
            className="h-9 rounded-md border bg-card px-2 text-sm text-foreground"
          >
            <option value="all">Todos</option>
            {buildingOptions.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
      </section>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando historial…</p>
      ) : grouped.length === 0 ? (
        <p className="rounded-md border bg-card p-4 text-sm text-muted-foreground">
          {tickets.length === 0
            ? 'Todavía no tenés tareas cerradas.'
            : 'No hay tareas con esos filtros.'}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {grouped.map(([day, items]) => (
            <section key={day} className="flex flex-col gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {formatDayHeading(day)}
              </h2>
              <ul className="flex flex-col gap-2">
                {items.map((t) => (
                  <li
                    key={t.id}
                    className="flex flex-col gap-1 rounded-md border bg-card px-3 py-2"
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-sm font-medium">{t.title}</span>
                        {t.building.name && (
                          <span className="truncate text-xs text-muted-foreground">
                            {t.building.name}
                            {t.building.administration.company_name
                              ? ` · ${t.building.administration.company_name}`
                              : ''}
                          </span>
                        )}
                      </div>
                      <Badge variant={statusVariant[t.status]} className="shrink-0">
                        {statusLabel[t.status]}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{formatTime(t.closed_at)}</span>
                    </div>
                    {t.status === 'resolved' && t.resolution_notes && (
                      <p className="text-xs text-muted-foreground">{t.resolution_notes}</p>
                    )}
                    {t.status === 'cancelled' && t.cancellation_reason && (
                      <p className="text-xs text-muted-foreground">{t.cancellation_reason}</p>
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
