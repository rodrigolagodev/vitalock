import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, Clock, CheckCircle2 } from 'lucide-react';
import { Input } from '@vitalock/ui';
import { Button } from '@vitalock/ui';
import { Badge } from '@vitalock/ui';
import { StatCard } from '@vitalock/ui';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTechnicalOrders } from '@/hooks/useTechnicalOrders';
import { useAdministrations } from '@/hooks/useAdministrations';
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
  { value: 'completed', label: 'Completado' },
  { value: 'invoiced', label: 'Facturado' },
  { value: 'cancelled', label: 'Cancelado' },
];

export default function TechnicalOrdersPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [administrationId, setAdministrationId] = useState<string>('all');

  const debouncedSearch = useDebounce(search, 300);

  const { data: administrations = [] } = useAdministrations();

  const hasFilters =
    debouncedSearch.trim() !== '' || status !== 'all' || administrationId !== 'all';

  const { data: orders = [], isFetching, isError } = useTechnicalOrders({
    search: debouncedSearch,
    status: status === 'all' ? undefined : status,
    administrationId: administrationId === 'all' ? undefined : administrationId,
  });

  if (isError) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-destructive">
          Error al cargar las órdenes de servicio técnico. Recargá la página.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Servicio técnico</h1>
        <Button asChild>
          <Link to="/servicio-tecnico/nueva">Nueva orden</Link>
        </Button>
      </div>

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
          label="Completadas"
          value={String(
            orders.filter((o) => o.status === 'completed').length,
          )}
          icon={<CheckCircle2 />}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Buscar por número de orden, cliente..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Select value={administrationId} onValueChange={setAdministrationId}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Todas las administraciones" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las administraciones</SelectItem>
            {administrations.map((admin) => (
              <SelectItem key={admin.id} value={admin.id}>
                {admin.company_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
