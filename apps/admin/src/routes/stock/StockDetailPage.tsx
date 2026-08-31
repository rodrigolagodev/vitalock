import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Boxes, Coins, Lock, Package } from 'lucide-react';
import { Input } from '@vitalock/ui';
import { Button } from '@vitalock/ui';
import { Label } from '@vitalock/ui';
import { Badge } from '@vitalock/ui';
import { Checkbox } from '@vitalock/ui';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@vitalock/ui';
import {
  ErrorState,
  NotFoundState,
  Skeleton,
  StatCard,
} from '@vitalock/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { EditableTitle } from '@/components/layout/EditableTitle';
import { useProduct } from '@/hooks/useProduct';
import { useMutateProduct } from '@/hooks/useMutateProduct';
import { useStockMovements } from '@/hooks/useStockMovements';
import { CATEGORY_LABELS } from '@/components/stock/ProductFormFields';
import { StockMovementsTable } from '@/components/stock/StockMovementsTable';
import { AjusteStockSheet } from '@/components/stock/AjusteStockSheet';
import { formatCurrency } from '@/lib/format';
import type { MovementType } from '@/types/stock';

const MOVEMENT_LABELS: Record<MovementType, string> = {
  compra: 'Compra',
  devolucion: 'Devolución',
  ajuste_manual: 'Ajuste manual',
  egreso_grabacion: 'Egreso por grabación',
  egreso_instalacion: 'Egreso por instalación',
  baja_defectuoso: 'Baja por defectuoso',
  baja_perdida: 'Baja por pérdida',
  reserva: 'Reserva',
  liberacion_reserva: 'Liberación de reserva',
};

const MOVEMENT_TYPES = Object.entries(MOVEMENT_LABELS) as [
  MovementType,
  string,
][];

function startOfDay(iso: string): number {
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function endOfDay(iso: string): number {
  const d = new Date(iso);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

export default function StockDetailPage() {
  const { productId } = useParams<{ productId: string }>();
  const { data: product, isLoading, isError } = useProduct(productId);
  const { updateProduct } = useMutateProduct();
  const { data: movements = [], isFetching } = useStockMovements(productId);

  const [typeFilter, setTypeFilter] = useState<MovementType[]>([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [movementSheetOpen, setMovementSheetOpen] = useState(false);

  if (!productId) {
    return (
      <ErrorState
        message="ID de producto inválido."
        back={{ label: 'Volver a stock', to: '/stock' }}
        className="py-24"
      />
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (isError || product == null) {
    return isError ? (
      <ErrorState
        message="Error al cargar el producto."
        back={{ label: 'Volver a stock', to: '/stock' }}
        className="py-24"
      />
    ) : (
      <NotFoundState
        message="Producto no encontrado."
        back={{ label: 'Volver a stock', to: '/stock' }}
      />
    );
  }

  const hasFilters =
    typeFilter.length > 0 || dateFrom !== '' || dateTo !== '';

  const filteredMovements = movements.filter((movement) => {
    if (typeFilter.length > 0 && !typeFilter.includes(movement.type))
      return false;
    const ts = new Date(movement.created_at).getTime();
    if (dateFrom && ts < startOfDay(dateFrom)) return false;
    if (dateTo && ts > endOfDay(dateTo)) return false;
    return true;
  });

  const handleSaveName = (name: string) => {
    if (productId) {
      updateProduct.mutate({ id: productId, name });
    }
  };

  const isSaving = updateProduct.isPending;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[{ label: 'Stock', to: '/stock' }, { label: product.name }]}
        title={
          <EditableTitle
            value={product.name}
            onSave={handleSaveName}
            isSaving={isSaving}
            adornment={
              <Badge variant="secondary" data-testid="product-category">
                {CATEGORY_LABELS[product.category]}
              </Badge>
            }
          />
        }
      >
        <Button onClick={() => setMovementSheetOpen(true)}>Nuevo movimiento</Button>
      </PageHeader>

      {/* ---- Live stock snapshot ---- */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="product-stats">
        <StatCard
          label="Disponible"
          value={product.stock_disponible}
          icon={<Package />}
        />
        <StatCard
          label="Reservado"
          value={product.stock_reservado}
          icon={<Lock />}
        />
        <StatCard
          label="Total"
          value={product.stock_total}
          icon={<Boxes />}
        />
        <StatCard
          label="Costo de compra"
          value={formatCurrency(product.cost_price)}
          icon={<Coins />}
        />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-2">
            <Label>Tipo</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" className="w-52 justify-start">
                  {typeFilter.length === 0
                    ? 'Todos los tipos'
                    : typeFilter.length === 1
                      ? MOVEMENT_LABELS[typeFilter[0]!]
                      : `Tipos (${typeFilter.length})`}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64" align="start">
                <div className="flex items-center justify-between pb-2">
                  <span className="text-sm font-medium">Tipos de movimiento</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setTypeFilter([])}
                  >
                    Todos
                  </Button>
                </div>
                <div className="flex flex-col gap-1.5">
                  {MOVEMENT_TYPES.map(([value, label]) => {
                    const checked = typeFilter.includes(value);
                    return (
                      <label
                        key={value}
                        className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1 text-sm hover:bg-accent"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(c) => {
                            setTypeFilter((prev) =>
                              c
                                ? [...prev, value]
                                : prev.filter((t) => t !== value),
                            );
                          }}
                        />
                        {label}
                      </label>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
            {typeFilter.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {typeFilter.map((t) => (
                  <Badge key={t} variant="secondary">
                    {MOVEMENT_LABELS[t]}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="movement-from">Desde</Label>
            <Input
              id="movement-from"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="movement-to">Hasta</Label>
            <Input
              id="movement-to"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>

          {hasFilters && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setTypeFilter([]);
                setDateFrom('');
                setDateTo('');
              }}
            >
              Limpiar filtros
            </Button>
          )}
        </div>

        <StockMovementsTable
          rows={filteredMovements}
          isFetching={isFetching}
          hasFilters={hasFilters}
        />
      </div>

      <AjusteStockSheet
        open={movementSheetOpen}
        onOpenChange={setMovementSheetOpen}
        productId={productId}
        productName={product.name}
        stockDisponible={product.stock_disponible}
      />
    </div>
  );
}
