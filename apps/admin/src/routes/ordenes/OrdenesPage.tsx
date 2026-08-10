import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useOrdens } from '@/hooks/useOrdens';
import { useDebounce } from '@/hooks/useDebounce';
import { OrdenesTable } from '@/components/ordenes/OrdenesTable';
import { OrdenFormSheet } from '@/components/ordenes/OrdenFormSheet';

type StatusFilter =
  | 'all'
  | 'draft'
  | 'in_preparation'
  | 'ready_for_pickup'
  | 'completed'
  | 'cancelled';

const STATUS_PILLS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'draft', label: 'Borrador' },
  { value: 'in_preparation', label: 'En preparación' },
  { value: 'ready_for_pickup', label: 'Listo para retirar' },
  { value: 'completed', label: 'Completado' },
  { value: 'cancelled', label: 'Cancelado' },
];

export default function OrdenesPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [createOpen, setCreateOpen] = useState(false);

  const debouncedSearch = useDebounce(search, 300);

  const hasFilters = debouncedSearch.trim() !== '' || status !== 'all';

  const { data: ordenes = [], isFetching, isError } = useOrdens({
    search: debouncedSearch,
    status: status === 'all' ? undefined : status,
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
        <Button onClick={() => setCreateOpen(true)}>Nueva orden</Button>
      </div>

      <Input
        placeholder="Buscar por número de orden, cliente..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      <div className="flex flex-wrap gap-2">
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

      <OrdenesTable
        ordenes={ordenes}
        isFetching={isFetching}
        hasFilters={hasFilters}
      />

      <OrdenFormSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
    </div>
  );
}
