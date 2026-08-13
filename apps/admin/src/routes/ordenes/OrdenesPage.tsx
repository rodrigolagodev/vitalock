import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, Clock, PackageCheck } from 'lucide-react';
import { Input } from '@vitalock/ui';
import { Button } from '@vitalock/ui';
import { Badge } from '@vitalock/ui';
import { StatCard } from '@vitalock/ui';
import { useOrdens } from '@/hooks/useOrdens';
import { useDebounce } from '@/hooks/useDebounce';
import { OrdenesTable } from '@/components/ordenes/OrdenesTable';

import type { OrderType } from '@/hooks/useOrdens';

type StatusFilter =
  | 'all'
  | 'draft'
  | 'confirmed'
  | 'ready_for_pickup'
  | 'in_progress'
  | 'completed'
  | 'invoiced'
  | 'cancelled';

type TypeFilter = 'all' | OrderType;

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

const TYPE_PILLS: { value: TypeFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'keys', label: 'Llaves' },
  { value: 'technical', label: 'Servicio técnico' },
];

export default function OrdenesPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [orderType, setOrderType] = useState<TypeFilter>('all');

  const debouncedSearch = useDebounce(search, 300);

  const hasFilters =
    debouncedSearch.trim() !== '' || status !== 'all' || orderType !== 'all';

  const { data: ordenes = [], isFetching, isError } = useOrdens({
    search: debouncedSearch,
    status: status === 'all' ? undefined : status,
    orderType: orderType === 'all' ? undefined : orderType,
  });

  if (isError) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-destructive">
          Error al cargar las órdenes. Recargá la página.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Ordenes</h1>
        <Button asChild>
          <Link to="/ordenes/nueva">Nueva orden</Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="stat-cards">
        <StatCard
          label="Total órdenes"
          value={String(ordenes.length)}
          icon={<ClipboardList />}
        />
        <StatCard
          label="En proceso"
          value={String(
            ordenes.filter((orden) => orden.status === 'in_progress').length,
          )}
          icon={<Clock />}
        />
        <StatCard
          label="Listo para retirar"
          value={String(
            ordenes.filter((orden) => orden.status === 'ready_for_pickup')
              .length,
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

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase text-muted-foreground">Tipo:</span>
          {TYPE_PILLS.map((pill) => (
            <button
              key={pill.value}
              type="button"
              onClick={() => setOrderType(pill.value)}
            >
              <Badge
                variant={orderType === pill.value ? 'default' : 'secondary'}
                className="cursor-pointer"
              >
                {pill.label}
              </Badge>
            </button>
          ))}
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
      </div>

      <OrdenesTable
        ordenes={ordenes}
        isFetching={isFetching}
        hasFilters={hasFilters}
      />
    </div>
  );
}
