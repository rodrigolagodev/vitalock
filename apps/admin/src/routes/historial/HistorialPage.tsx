import { useState } from 'react';
import { ErrorState, FilterBar } from '@vitalock/ui';
import { PageHeader } from '@vitalock/ui';
import { useAllOrders } from '@/hooks/useAllOrders';
import { HistorialTable } from '@/components/historial/HistorialTable';
import type { AllOrderKind } from '@/hooks/useAllOrders';

const KIND_OPTIONS: { value: AllOrderKind; label: string }[] = [
  { value: 'key', label: 'Llaves' },
  { value: 'technical', label: 'Servicio técnico' },
];

const STATUS_OPTIONS: { value: string; label: string }[] = [
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
  const [kinds, setKinds] = useState<AllOrderKind[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [dates, setDates] = useState({ from: '', to: '' });

  const hasFilters =
    search.trim() !== '' ||
    kinds.length > 0 ||
    statuses.length > 0 ||
    dates.from !== '' ||
    dates.to !== '';

  const {
    data: orders = [],
    isFetching,
    isError,
  } = useAllOrders({
    search,
    status: statuses,
    orderKind: kinds,
    dateFrom: dates.from || undefined,
    dateTo: dates.to || undefined,
  });

  if (isError) {
    return <ErrorState message="Error al cargar el historial. Recargá la página." />;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Órdenes" />

      <FilterBar>
        <FilterBar.Search
          placeholder="Buscar por número de orden, cliente..."
          value={search}
          onChange={setSearch}
          className="max-w-sm"
        />
        <FilterBar.DateRange value={dates} onChange={setDates} />
        <FilterBar.MultiSelect
          facet="kind"
          label="Tipo"
          options={KIND_OPTIONS}
          value={kinds}
          onChange={(next) => setKinds(next as AllOrderKind[])}
        />
        <FilterBar.MultiSelect
          facet="status"
          label="Estado"
          options={STATUS_OPTIONS}
          value={statuses}
          onChange={setStatuses}
        />
        <FilterBar.Summary />
      </FilterBar>

      <HistorialTable orders={orders} isFetching={isFetching} hasFilters={hasFilters} />
    </div>
  );
}
