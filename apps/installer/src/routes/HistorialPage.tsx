import { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  DataCardList,
  EmptyState,
  FilterBar,
  PageHeader,
  Skeleton,
  formatMonthHeading,
  monthKey,
} from '@vitalock/ui';
import type { DataTableColumn } from '@vitalock/ui';
import { useTicketHistory } from '@/hooks/useTicketHistory';
import { categoryIcon, categoryLabel, tareaStatus } from '@/lib/status/tareaStatus';
import type { HistoricalTicket } from '@/hooks/useTicketHistory';

type StatusFilter = 'all' | 'resolved' | 'cancelled';

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  const day = date.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const time = date.toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `${day} · ${time}`;
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
 * Shows resolved + cancelled tickets as a responsive multi-column card
 * grid, grouped by calendar month (most recent month first; server-sorted
 * `updated_at` keeps cards within a month newest-first too) — each card
 * still carries its own close date since a month heading alone doesn't
 * say which day. Filters by status and by building let the installer
 * narrow the view when the history grows. Each title links to the
 * read-only task detail at /tareas/:id.
 *
 * The card title is the ticket's `category` (via `categoryLabel`), not its
 * free-text `title`/`description` — the admin's description is inconsistent
 * prose, while the category is a small controlled vocabulary. A decorative
 * `card: 'icon'` column (via `categoryIcon`) renders next to the title so
 * the task type is scannable before reading any text.
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

  const columns: DataTableColumn<HistoricalTicket>[] = [
    {
      header: 'Tarea',
      cell: (t) => categoryLabel(t.category),
    },
    {
      header: 'Tipo',
      cell: (t) => {
        const Icon = categoryIcon(t.category);
        return <Icon aria-hidden="true" className="text-muted-foreground h-5 w-5" />;
      },
      card: 'icon',
    },
    {
      header: 'Edificio',
      cell: (t) => (
        <>
          {t.building.name}
          {t.building.administration.company_name
            ? ` · ${t.building.administration.company_name}`
            : ''}
        </>
      ),
    },
    {
      header: 'Estado',
      cell: (t) => <tareaStatus.Badge status={t.status} />,
      card: 'status',
    },
    {
      header: 'Fecha',
      cell: (t) => formatDateTime(t.closed_at),
    },
    {
      header: 'Detalle',
      cell: (t) =>
        (t.status === 'resolved'
          ? t.resolution_notes
          : t.status === 'cancelled'
            ? t.cancellation_reason
            : null) ?? '—',
    },
  ];

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

      <FilterBar>
        <FilterBar.Select
          facet="status"
          label="Estado"
          variant="native"
          allValue="all"
          options={[
            { value: 'all', label: 'Todas' },
            { value: 'resolved', label: 'Resueltas' },
            { value: 'cancelled', label: 'Canceladas' },
          ]}
          value={status}
          onChange={(v) => setStatus(v as StatusFilter)}
        />
        <FilterBar.Select
          facet="building"
          label="Edificio"
          variant="native"
          allValue="all"
          options={[
            { value: 'all', label: 'Todos' },
            ...buildingOptions.map((b) => ({ value: b.id, label: b.name })),
          ]}
          value={buildingId}
          onChange={setBuildingId}
        />
        <FilterBar.Summary />
      </FilterBar>

      {isLoading ? (
        <LoadingSkeletons />
      ) : filtered.length === 0 ? (
        <EmptyState
          className="bg-card rounded-md border p-4"
          message={
            tickets.length === 0
              ? 'Todavía no tenés tareas cerradas.'
              : 'No hay tareas con esos filtros.'
          }
        />
      ) : (
        <DataCardList<HistoricalTicket>
          rows={filtered}
          columns={columns}
          rowKey={(t) => t.id}
          firstCell="link"
          getRowHref={(t) => `/tareas/${t.id}`}
          groupBy={(t) => monthKey(t.closed_at)}
          groupLabel={(key) => formatMonthHeading(key)}
          paginated={false}
        />
      )}
    </div>
  );
}
