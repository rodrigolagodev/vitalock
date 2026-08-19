import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, Clock, PackageCheck } from 'lucide-react';
import { Input } from '@vitalock/ui';
import { Button } from '@vitalock/ui';
import { Badge } from '@vitalock/ui';
import { StatCard } from '@vitalock/ui';
import { useKeyOrders } from '@/hooks/useKeyOrders';
import { useDebounce } from '@/hooks/useDebounce';
import { LlavesTable } from '@/components/llaves/LlavesTable';
import type { KeyOrderStatus } from '@/hooks/useKeyOrders';

type StatusFilter = 'all' | KeyOrderStatus;

const STATUS_PILLS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'draft', label: 'Borrador' },
  { value: 'confirmed', label: 'Confirmada' },
  { value: 'ready_for_pickup', label: 'Listo para retirar' },
  { value: 'in_progress', label: 'En proceso' },
  { value: 'completed', label: 'Completado' },
  { value: 'invoiced', label: 'Facturado' },
  { value: 'cancelled', label: 'Cancelado' },
];

export default function KeyOrdersPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');

  const debouncedSearch = useDebounce(search, 300);

  const hasFilters = debouncedSearch.trim() !== '' || status !== 'all';

  const { data: orders = [], isFetching, isError } = useKeyOrders({
    search: debouncedSearch,
    status: status === 'all' ? undefined : status,
  });

  if (isError) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-destructive">
          Error al cargar las órdenes de llave. Recargá la página.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Llaves</h1>
        <Button asChild>
          <Link to="/llaves/nueva">Nueva orden</Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="stat-cards">
        <StatCard
          label="Total órdenes"
          value={String(orders.length)}
          icon={<ClipboardList />}
        />
        <StatCard
          label="En proceso"
          value={String(
            orders.filter((o) => o.status === 'in_progress').length,
          )}
          icon={<Clock />}
        />
        <StatCard
          label="Listo para retirar"
          value={String(
            orders.filter((o) => o.status === 'ready_for_pickup').length,
          )}
          icon={<PackageCheck />}
        />
      </div>

      <Input
        placeholder="Buscar por número de orden, cliente..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

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

      <LlavesTable
        rows={orders}
        isFetching={isFetching}
        hasFilters={hasFilters}
      />
    </div>
  );
}
