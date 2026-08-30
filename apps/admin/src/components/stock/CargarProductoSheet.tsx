import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@vitalock/ui';
import { Button } from '@vitalock/ui';
import { Label } from '@vitalock/ui';
import { Input } from '@vitalock/ui';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@vitalock/ui';
import { ProductFormFields } from './ProductFormFields';
import { useProducts } from '@/hooks/useProducts';
import { useMutateStockMovement } from '@/hooks/useMutateStockMovement';
import { useAuthContext } from '@vitalock/shared';
import { toastMutationError } from '@/lib/errors/toast';
import type { MovementType } from '@/types/stock';

const schema = z
  .discriminatedUnion('mode', [
    z.object({
      mode: z.literal('existing'),
      product_id: z.string().min(1, 'Seleccioná un producto'),
      // 0 = no actualizar el precio de costo actual del producto.
      unit_cost: z
        .number({ invalid_type_error: 'Ingresá un número' })
        .min(0, 'El costo unitario no puede ser negativo'),
      quantity: z.number().positive('La cantidad debe ser mayor a 0'),
      note: z.string().optional(),
    }),
    z.object({
      mode: z.literal('new'),
      name: z.string().min(1, 'El nombre es obligatorio'),
      category: z.enum(['rfid_key', 'equipment']),
      unit_cost: z.number().positive('El costo unitario debe ser mayor a 0'),
      quantity: z.number().positive('La cantidad debe ser mayor a 0'),
      note: z.string().optional(),
    }),
  ])
  .superRefine((data, ctx) => {
    if (!Number.isFinite(data.quantity) || data.quantity <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'La cantidad debe ser mayor a 0',
        path: ['quantity'],
      });
    }
  });

type FormValues = z.infer<typeof schema>;

interface CargarProductoSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CargarProductoSheet({ open, onOpenChange }: CargarProductoSheetProps) {
  const { staff } = useAuthContext();
  const { data: products = [] } = useProducts();
  const { createMovement, createProductWithStock } = useMutateStockMovement();
  const [duplicateError, setDuplicateError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    watch,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      mode: 'existing',
      product_id: '',
      unit_cost: 0,
      quantity: 1,
      note: '',
    },
  });

  const mode = watch('mode');
  const typedName = watch('name')?.trim() ?? '';
  const selectedCategory = watch('category');
  const isPending =
    createMovement.isPending || createProductWithStock.isPending;

  useEffect(() => {
    if (!open) return;
    reset({
      mode: 'existing',
      product_id: '',
      unit_cost: 0,
      quantity: 1,
      note: '',
    });
    setDuplicateError(null);
  }, [open, reset]);

  useEffect(() => {
    // Reset product selection when switching to "new" mode and vice-versa so
    // no stale product id leaks into a creation payload.
    if (mode === 'new') {
      setValue('product_id', '');
      // Alta de producto: el costo es obligatorio y positivo, así que
      // arrancamos el campo vacío para que el usuario tenga que tipearlo.
      setValue('unit_cost', undefined as unknown as number);
    } else {
      // Producto existente: 0 = "no actualizar el precio de costo actual".
      setValue('unit_cost', 0);
    }
  }, [mode, setValue]);

  const onSubmit = async (values: FormValues) => {
    setDuplicateError(null);
    try {
      if (values.mode === 'existing') {
        await createMovement.mutateAsync({
          productId: values.product_id,
          movementType: 'compra' as MovementType,
          quantity: values.quantity,
          // 0 → null: no registrar costo ni tocar products.cost_price.
          unitCost: values.unit_cost > 0 ? values.unit_cost : null,
          note: values.note?.trim() || null,
          actor_staff_id: staff?.id ?? null,
        });
      } else {
        await createProductWithStock.mutateAsync({
          name: values.name,
          category: values.category,
          costPrice: values.unit_cost,
          quantity: values.quantity,
          note: values.note?.trim() || null,
          actor_staff_id: staff?.id ?? null,
        });
      }
      onOpenChange(false);
    } catch (err) {
      const e = err as { code?: string; message?: string };
      if (e?.code === '23505') {
        setDuplicateError(
          'Ya existe un producto con ese nombre. Usá el modo "Producto existente" para sumar stock.',
        );
        return;
      }
      toastMutationError(err as Error);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !isPending && onOpenChange(o)}>
      <SheetContent side="right" className="flex flex-col gap-0 sm:max-w-lg overflow-y-auto">
        <SheetHeader className="p-6 pb-4">
          <SheetTitle>Cargar producto</SheetTitle>
        </SheetHeader>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-1 flex-col gap-6 px-6"
        >
          {/* ---- Mode toggle ---- */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="product-mode">Tipo de carga *</Label>
            <Controller
              control={control}
              name="mode"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={(v) => field.onChange(v as FormValues['mode'])}
                >
                  <SelectTrigger id="product-mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="existing">Producto existente</SelectItem>
                    <SelectItem value="new">Producto nuevo</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          {mode === 'existing' ? (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="product-select">Producto *</Label>
              <Controller
                control={control}
                name="product_id"
                render={({ field }) => (
                  <Select
                    value={field.value ?? ''}
                    onValueChange={field.onChange}
                  >
                    <SelectTrigger id="product-select">
                      <SelectValue placeholder="Seleccioná un producto" />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {(
                errors as Record<string, { message?: string } | undefined>
              ).product_id && (
                <p className="text-sm text-destructive">
                  {(errors as Record<string, { message?: string }>).product_id
                    ?.message}
                </p>
              )}
            </div>

            {/* ---- Unit cost (0 = mantener el precio de costo actual) ---- */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="product-unit-cost">Costo unitario</Label>
              <Controller
                control={control}
                name="unit_cost"
                render={({ field }) => (
                  <Input
                    id="product-unit-cost"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={field.value ?? 0}
                    onChange={(e) =>
                      field.onChange(
                        e.target.value === '' ? 0 : Number(e.target.value),
                      )
                    }
                  />
                )}
              />
              <p className="text-xs text-muted-foreground">
                Dejalo en 0 para no actualizar el precio de costo actual del producto.
              </p>
              {(
                errors as Record<string, { message?: string } | undefined>
              ).unit_cost && (
                <p className="text-sm text-destructive">
                  {(errors as Record<string, { message?: string }>).unit_cost
                    ?.message}
                </p>
              )}
              </div>
            </>
        ) : (
          <>
            <ProductFormFields
              control={control}
              name="name"
              categoryName="category"
              errors={errors}
            />

            {/* ---- Unit cost (obligatorio al dar de alta el producto) ---- */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="product-unit-cost">Costo unitario *</Label>
              <Controller
                control={control}
                name="unit_cost"
                render={({ field }) => (
                  <Input
                    id="product-unit-cost"
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="0.00"
                    value={field.value ?? ''}
                    onChange={(e) =>
                      field.onChange(
                        e.target.value === '' ? '' : Number(e.target.value),
                      )
                    }
                  />
                )}
              />
              {(
                errors as Record<string, { message?: string } | undefined>
              ).unit_cost && (
                <p className="text-sm text-destructive">
                  {(errors as Record<string, { message?: string }>).unit_cost
                    ?.message}
                </p>
              )}
            </div>
            {typedName && selectedCategory &&
              products.some(
                (p) =>
                  p.category === selectedCategory &&
                  p.name.trim().toLowerCase() === typedName.toLowerCase(),
              ) && (
                <p className="text-sm text-warning">
                  Ya existe &quot;{typedName}&quot; en esta categoría. Se
                  validará al guardar.
                </p>
              )}
          </>
        )}

          {/* ---- Quantity ---- */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="product-quantity">Cantidad *</Label>
            <Controller
              control={control}
              name="quantity"
              render={({ field }) => (
                <Input
                  id="product-quantity"
                  type="number"
                  min="1"
                  step="1"
                  value={field.value ?? ''}
                  onChange={(e) =>
                    field.onChange(
                      e.target.value === '' ? '' : Number(e.target.value),
                    )
                  }
                />
              )}
            />
            {errors.quantity && (
              <p className="text-sm text-destructive">
                {errors.quantity.message}
              </p>
            )}
          </div>

          {/* ---- Note ---- */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="product-note">Nota</Label>
            <Controller
              control={control}
              name="note"
              render={({ field }) => (
                <Input
                  id="product-note"
                  placeholder="Ej: reposición inicial, compra a proveedor..."
                  value={field.value ?? ''}
                  onChange={field.onChange}
                />
              )}
            />
          </div>

          {duplicateError && (
            <p className="text-sm text-destructive">{duplicateError}</p>
          )}

          <SheetFooter className="mt-auto pt-4 pb-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending || isSubmitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending || isSubmitting}>
              {isPending || isSubmitting ? 'Cargando...' : 'Cargar'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
