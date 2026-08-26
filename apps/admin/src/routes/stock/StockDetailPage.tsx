import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Input } from '@vitalock/ui';
import { Button } from '@vitalock/ui';
import { Label } from '@/components/ui/label';
import { Badge } from '@vitalock/ui';
import { Checkbox } from '@vitalock/ui';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { PageHeader } from '@/components/layout/PageHeader';
import { useProduct } from '@/hooks/useProduct';
import { useMutateProduct } from '@/hooks/useMutateProduct';
import { useStockMovements } from '@/hooks/useStockMovements';
import { ProductFormFields } from '@/components/stock/ProductFormFields';
import { StockMovementsTable } from '@/components/stock/StockMovementsTable';
import { AjusteStockSheet } from '@/components/stock/AjusteStockSheet';
import type { MovementType, ProductCategory } from '@/types/stock';

const EditProductSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio').max(120, 'Máximo 120 caracteres'),
  category: z.enum(['rfid_key', 'equipment']),
  cost_price: z.number().nonnegative('No puede ser negativo').nullable(),
});

type EditFormValues = z.infer<typeof EditProductSchema>;

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

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<EditFormValues>({
    resolver: zodResolver(EditProductSchema),
    defaultValues: { name: '', category: 'rfid_key', cost_price: null },
  });

  useEffect(() => {
    if (product) {
      reset({
        name: product.name,
        category: product.category as ProductCategory,
        cost_price: product.cost_price,
      });
    }
  }, [product, reset]);

  if (!productId) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-lg font-medium text-muted-foreground">
          ID de producto inválido.
        </p>
        <Link to="/stock" className="mt-4 text-sm underline">
          Volver a stock
        </Link>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <div className="h-8 w-64 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-40 animate-pulse rounded-md bg-muted" />
        <div className="h-64 animate-pulse rounded-md bg-muted" />
      </div>
    );
  }

  if (isError || product == null) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-lg font-medium text-muted-foreground">
          {isError ? 'Error al cargar el producto.' : 'Producto no encontrado.'}
        </p>
        <Link to="/stock" className="mt-4 text-sm underline">
          Volver a stock
        </Link>
      </div>
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

  const onSubmit = (values: EditFormValues) => {
    updateProduct.mutate({ id: productId, ...values });
  };

  const isSaving = updateProduct.isPending || isSubmitting;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[{ label: 'Stock', to: '/stock' }, { label: product.name }]}
        title={product.name}
        subtitle={`Disponible: ${product.stock_disponible} · Reservado: ${product.stock_reservado} · Total: ${product.stock_total}`}
      >
        <Button onClick={() => setMovementSheetOpen(true)}>Nuevo movimiento</Button>
      </PageHeader>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="flex flex-col gap-4 rounded-md border p-4 bg-card"
      >
        <h2 className="text-lg font-semibold">Editar producto</h2>
        <div className="grid max-w-md gap-4">
          <ProductFormFields
            control={control}
            name="name"
            categoryName="category"
            costPriceName="cost_price"
            errors={errors}
          />
        </div>
        <div>
          <Button
            type="submit"
            disabled={!isDirty || isSaving}
          >
            {isSaving ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        </div>
      </form>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Movimientos de stock</h2>

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
