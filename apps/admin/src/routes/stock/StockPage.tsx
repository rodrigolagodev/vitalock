import { useState } from 'react';
import { Input } from '@vitalock/ui';
import { Button } from '@vitalock/ui';
import { Badge } from '@vitalock/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { useProducts } from '@/hooks/useProducts';
import { useDebounce } from '@/hooks/useDebounce';
import { ProductsTable } from '@/components/stock/ProductsTable';
import { CargarProductoSheet } from '@/components/stock/CargarProductoSheet';
import type { ProductCategory } from '@/types/stock';

type CategoryFilter = 'all' | ProductCategory;

const CATEGORY_PILLS: { value: CategoryFilter; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'rfid_key', label: 'Llaves RFID' },
  { value: 'equipment', label: 'Equipos' },
];

export default function StockPage() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [createOpen, setCreateOpen] = useState(false);

  const debouncedSearch = useDebounce(search, 300);

  const hasFilters = debouncedSearch.trim() !== '' || category !== 'all';

  const {
    data: products = [],
    isFetching,
    isError,
  } = useProducts({
    category: category === 'all' ? undefined : category,
    search: debouncedSearch,
  });

  if (isError) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-destructive">
          Error al cargar los productos. Recargá la página.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Stock"
        subtitle="Gestioná el catálogo de productos y los movimientos de stock."
      >
        <Button onClick={() => setCreateOpen(true)}>Cargar producto</Button>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Buscar por nombre..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {CATEGORY_PILLS.map((pill) => (
          <button
            key={pill.value}
            type="button"
            onClick={() => setCategory(pill.value)}
          >
            <Badge
              variant={category === pill.value ? 'default' : 'secondary'}
              className="cursor-pointer"
            >
              {pill.label}
            </Badge>
          </button>
        ))}
      </div>

      <ProductsTable
        rows={products}
        isFetching={isFetching}
        hasFilters={hasFilters}
      />

      <CargarProductoSheet open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
