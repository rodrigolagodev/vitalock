import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, Clock, CheckCircle2 } from 'lucide-react';
import { Button, ErrorState, FilterBar, StatCard } from '@vitalock/ui';
import { PageHeader } from '@vitalock/ui';
import { CascadeFilter } from '@/components/filters/CascadeFilter';
import { useTechnicalOrders } from '@/hooks/useTechnicalOrders';
import { useAdministrations } from '@/hooks/useAdministrations';
import { useBuildings } from '@/hooks/useBuildings';
import { ServicioTecnicoTable } from '@/components/servicio-tecnico/ServicioTecnicoTable';
import type { TechnicalOrderStatus } from '@/hooks/useTechnicalOrders';

// spec #220: 6-value domain — ready_for_pickup MUST NOT appear.
const STATUS_OPTIONS: { value: TechnicalOrderStatus; label: string }[] = [
  { value: 'draft', label: 'Borrador' },
  { value: 'confirmed', label: 'Confirmada' },
  { value: 'in_progress', label: 'En proceso' },
  { value: 'completed', label: 'Lista para facturar' },
  { value: 'invoiced', label: 'Facturado' },
  { value: 'cancelled', label: 'Cancelado' },
];

export default function TechnicalOrdersPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<TechnicalOrderStatus[]>([]);
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
    isFetching,
    isError,
  } = useTechnicalOrders({
    search,
    status,
    administrationId,
    buildingId,
  });

  if (isError) {
    return (
      <ErrorState message="Error al cargar las órdenes de servicio técnico. Recargá la página." />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Servicio técnico">
        <Button asChild>
          <Link to="/servicio-tecnico/nueva">Nueva orden</Link>
        </Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="stat-cards">
        <StatCard label="Total órdenes" value={String(orders.length)} icon={<ClipboardList />} />
        <StatCard
          label="Abiertas"
          value={String(
            orders.filter(
              (o) =>
                o.status !== 'completed' && o.status !== 'invoiced' && o.status !== 'cancelled',
            ).length,
          )}
          icon={<Clock />}
        />
        <StatCard
          label="Listas para facturar"
          value={String(orders.filter((o) => o.status === 'completed').length)}
          icon={<CheckCircle2 />}
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
          onChange={(next) => setStatus(next as TechnicalOrderStatus[])}
        />
        <FilterBar.Summary />
      </FilterBar>

      <ServicioTecnicoTable rows={orders} isFetching={isFetching} hasFilters={hasFilters} />
    </div>
  );
}
