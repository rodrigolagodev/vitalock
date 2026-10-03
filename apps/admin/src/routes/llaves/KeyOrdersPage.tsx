import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, Clock, PackageCheck } from 'lucide-react';
import { Button, ErrorState, FilterBar, StatCard, TruncationNotice } from '@vitalock/ui';
import { PageHeader } from '@vitalock/ui';
import { CascadeFilter } from '@/components/filters/CascadeFilter';
import { useKeyOrders } from '@/hooks/useKeyOrders';
import { useAdministrations } from '@/hooks/useAdministrations';
import { useBuildings } from '@/hooks/useBuildings';
import { LlavesTable } from '@/components/llaves/LlavesTable';
import type { KeyOrderStatus } from '@/hooks/useKeyOrders';

const STATUS_OPTIONS: { value: KeyOrderStatus; label: string }[] = [
  { value: 'draft', label: 'Borrador' },
  { value: 'confirmed', label: 'Confirmada' },
  { value: 'in_progress', label: 'En proceso' },
  { value: 'pending_installation', label: 'Pendiente instalación' },
  { value: 'ready_for_pickup', label: 'Listo para retirar' },
  { value: 'completed', label: 'Completado' },
  { value: 'invoiced', label: 'Facturado' },
  { value: 'cancelled', label: 'Cancelado' },
];

export default function KeyOrdersPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<KeyOrderStatus[]>([]);
  const [administrationId, setAdministrationId] = useState<string | undefined>();
  const [buildingId, setBuildingId] = useState<string | undefined>();

  const { data: administrations = [] } = useAdministrations();
  const { data: buildings = [] } = useBuildings({ administrationId });

  const hasFilters =
    search.trim() !== '' ||
    status.length > 0 ||
    administrationId !== undefined ||
    buildingId !== undefined;

  const {
    data: orders = [],
    total,
    truncated,
    isFetching,
    isError,
  } = useKeyOrders({
    search,
    status,
    administrationId,
    buildingId,
  });

  // "Total" uses the exact server count. Status breakdowns can only be derived
  // from the loaded rows, so when the list is capped they are lower bounds
  // ("N+") and the notice below explains why.
  const countLabel = (n: number) => (truncated ? `${n}+` : String(n));

  if (isError) {
    return <ErrorState message="Error al cargar las órdenes de llave. Recargá la página." />;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Llaves">
        <Button asChild>
          <Link to="/llaves/nueva">Nueva orden</Link>
        </Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="stat-cards">
        <StatCard
          label="Total órdenes"
          value={String(total ?? orders.length)}
          icon={<ClipboardList />}
        />
        <StatCard
          label="Abiertas"
          value={countLabel(
            orders.filter(
              (o) =>
                o.status !== 'completed' && o.status !== 'invoiced' && o.status !== 'cancelled',
            ).length,
          )}
          icon={<Clock />}
        />
        <StatCard
          label="Completadas"
          value={countLabel(orders.filter((o) => o.status === 'completed').length)}
          icon={<PackageCheck />}
        />
      </div>

      <FilterBar>
        <FilterBar.Search
          placeholder="Buscar por número de orden, cliente..."
          value={search}
          onChange={setSearch}
          className="max-w-sm"
        />
        <FilterBar.Cascade
          value={{
            administrationId: administrationId ?? '',
            buildingId: buildingId ?? '',
            equipmentId: '',
          }}
          onChange={(next) => {
            setAdministrationId(next.administrationId || undefined);
            setBuildingId(next.buildingId || undefined);
          }}
          labels={{ administration: 'Administración', building: 'Edificio', equipment: 'Equipo' }}
          resolveLabel={(level, id) => {
            if (level === 'administration') {
              return administrations.find((a) => a.id === id)?.company_name ?? id;
            }
            if (level === 'building') {
              return buildings.find((b) => b.id === id)?.name ?? id;
            }
            return id;
          }}
        >
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
        </FilterBar.Cascade>
        <FilterBar.MultiSelect
          facet="status"
          label="Estado"
          options={STATUS_OPTIONS}
          value={status}
          onChange={(next) => setStatus(next as KeyOrderStatus[])}
        />
        <FilterBar.Summary />
      </FilterBar>

      <TruncationNotice truncated={truncated} shown={orders.length} total={total} />

      <LlavesTable rows={orders} isFetching={isFetching} hasFilters={hasFilters} />
    </div>
  );
}
