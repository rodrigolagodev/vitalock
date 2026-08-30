import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, Clock, CheckCircle2 } from 'lucide-react';
import { Badge, Button, ErrorState, SearchInput, StatCard } from '@vitalock/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { CascadeFilter } from '@/components/filters/CascadeFilter';
import { useTechnicalOrders } from '@/hooks/useTechnicalOrders';
import { useAdministrations } from '@/hooks/useAdministrations';
import { useBuildings } from '@/hooks/useBuildings';
import { useDebounce } from '@/hooks/useDebounce';
import { ServicioTecnicoTable } from '@/components/servicio-tecnico/ServicioTecnicoTable';
import type { TechnicalOrderStatus } from '@/hooks/useTechnicalOrders';

// spec #220: 6-value domain — ready_for_pickup MUST NOT appear.
type StatusFilter = 'all' | TechnicalOrderStatus;

const STATUS_PILLS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'draft', label: 'Borrador' },
  { value: 'confirmed', label: 'Confirmada' },
  { value: 'in_progress', label: 'En proceso' },
  { value: 'completed', label: 'Lista para facturar' },
  { value: 'invoiced', label: 'Facturado' },
  { value: 'cancelled', label: 'Cancelado' },
];

export default function TechnicalOrdersPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [administrationId, setAdministrationId] = useState<string | undefined>();
  const [buildingId, setBuildingId] = useState<string | undefined>();

  const debouncedSearch = useDebounce(search, 300);

  const { data: administrations = [] } = useAdministrations();
  const { data: buildings = [] } = useBuildings({ administrationId });

  const hasFilters =
    debouncedSearch.trim() !== '' ||
    status !== 'all' ||
    administrationId !== undefined ||
    buildingId !== undefined;

  const { data: orders = [], isFetching, isError } = useTechnicalOrders({
    search: debouncedSearch,
    status: status === 'all' ? undefined : status,
    administrationId,
    buildingId,
  });

  if (isError) {
    return <ErrorState message="Error al cargar las órdenes de servicio técnico. Recargá la página." />;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Servicio técnico">
        <Button asChild>
          <Link to="/servicio-tecnico/nueva">Nueva orden</Link>
        </Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="stat-cards">
        <StatCard
          label="Total órdenes"
          value={String(orders.length)}
          icon={<ClipboardList />}
        />
        <StatCard
          label="Abiertas"
          value={String(
            orders.filter(
              (o) =>
                o.status !== 'completed' &&
                o.status !== 'invoiced' &&
                o.status !== 'cancelled',
            ).length,
          )}
          icon={<Clock />}
        />
        <StatCard
          label="Listas para facturar"
          value={String(
            orders.filter((o) => o.status === 'completed').length,
          )}
          icon={<CheckCircle2 />}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          placeholder="Buscar por número de orden, cliente..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <CascadeFilter
          value={{ administrationId, buildingId }}
          onChange={(next) => {
            setAdministrationId(next.administrationId);
            setBuildingId(next.buildingId);
          }}
          levels={['administration', 'building']}
          administrations={administrations.map((a) => ({
            id: a.id,
            label: a.company_name,
          }))}
          buildings={buildings.map((b) => ({
            id: b.id,
            label: b.name,
            parentId: b.administration_id,
          }))}
          equipment={[]}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase text-muted-foreground">Estado:</span>
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

      <ServicioTecnicoTable
        rows={orders}
        isFetching={isFetching}
        hasFilters={hasFilters}
      />
    </div>
  );
}
