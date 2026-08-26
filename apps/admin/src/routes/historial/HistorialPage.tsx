import { useState } from 'react';
import { Badge } from '@vitalock/ui';
import { Input } from '@vitalock/ui';
import { useAllOrders } from '@/hooks/useAllOrders';
import { useDebounce } from '@/hooks/useDebounce';
import { HistorialTable } from '@/components/historial/HistorialTable';
import type { AllOrderKind } from '@/hooks/useAllOrders';

type OrderKindFilter = 'all' | AllOrderKind;
type StatusFilter = string;

const KIND_PILLS: { value: OrderKindFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'key', label: 'Llaves' },
  { value: 'technical', label: 'Servicio técnico' },
];

const STATUS_PILLS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'draft', label: 'Borrador' },
  { value: 'confirmed', label: 'Confirmada' },
  { value: 'in_progress', label: 'En proceso' },
  { value: 'pending_installation', label: 'Pendiente instalación' },
  { value: 'ready_for_pickup', label: 'Listo para retirar' },
  { value: 'completed', label: 'Completado' },
  { value: 'invoiced', label: 'Facturado' },
  { value: 'cancelled', label: 'Cancelado' },
];

export default function HistorialPage() {
  const [search, setSearch] = useState('');
  const [orderKind, setOrderKind] = useState<OrderKindFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const debouncedSearch = useDebounce(search, 300);

  const hasFilters =
    debouncedSearch.trim() !== '' ||
    orderKind !== 'all' ||
    status !== 'all' ||
    dateFrom !== '' ||
    dateTo !== '';

  const {
    data: orders = [],
    isFetching,
    isError,
  } = useAllOrders({
    search: debouncedSearch,
    status: status === 'all' ? undefined : status,
    orderKind: orderKind === 'all' ? undefined : orderKind,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });

  if (isError) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-destructive">
          Error al cargar el historial. Recargá la página.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Historial</h1>

      <Input
        placeholder="Buscar por número de orden, cliente..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label htmlFor="date-from" className="text-xs uppercase text-muted-foreground">
            Desde
          </label>
          <Input
            id="date-from"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-40"
          />
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="date-to" className="text-xs uppercase text-muted-foreground">
            Hasta
          </label>
          <Input
            id="date-to"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-40"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase text-muted-foreground">Tipo:</span>
        {KIND_PILLS.map((pill) => (
          <button
            key={pill.value}
            type="button"
            onClick={() => setOrderKind(pill.value)}
          >
            <Badge
              variant={orderKind === pill.value ? 'default' : 'secondary'}
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

      <HistorialTable
        orders={orders}
        isFetching={isFetching}
        hasFilters={hasFilters}
      />
    </div>
  );
}
