import { useState } from 'react';
import { Package, TriangleAlert } from 'lucide-react';
import { Button, ErrorState, FilterBar, StatCard } from '@vitalock/ui';
import { PageHeader } from '@vitalock/ui';
import { useProducts } from '@/hooks/useProducts';
import { ProductsTable } from '@/components/stock/ProductsTable';
import { CargarProductoSheet } from '@/components/stock/CargarProductoSheet';
import { LOW_STOCK_THRESHOLD } from '@/lib/statThresholds';
import type { ProductCategory } from '@/types/stock';

const CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Todas' },
  { value: 'rfid_key', label: 'Llaves RFID' },
  { value: 'equipment', label: 'Equipos' },
];

export default function StockPage() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  const hasFilters = search.trim() !== '' || category !== '';

  const {
    data: products = [],
    isFetching,
    isError,
  } = useProducts({
    category: category === '' ? undefined : (category as ProductCategory),
    search,
  });

  if (isError) {
    return <ErrorState message="Error al cargar los productos. Recargá la página." />;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Stock"
        subtitle="Gestioná el catálogo de productos y los movimientos de stock."
      >
        <Button onClick={() => setCreateOpen(true)}>Cargar producto</Button>
      </PageHeader>

      <div className="flex max-w-full gap-4" data-testid="stat-cards">
        <StatCard label="Total productos" value={String(products.length)} icon={<Package />} />
        <StatCard
          label="Stock bajo"
          value={String(
            products.filter((product) => product.stock_disponible <= LOW_STOCK_THRESHOLD).length,
          )}
          icon={<TriangleAlert />}
        />
      </div>

      <FilterBar>
        <FilterBar.Search
          placeholder="Buscar por nombre..."
          value={search}
          onChange={setSearch}
          className="max-w-sm"
        />

        <FilterBar.Select
          facet="category"
          label="Categoría"
          options={CATEGORY_OPTIONS}
          value={category}
          onChange={setCategory}
        />

        <FilterBar.Summary />
      </FilterBar>

      <ProductsTable rows={products} isFetching={isFetching} hasFilters={hasFilters} />

      <CargarProductoSheet open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
