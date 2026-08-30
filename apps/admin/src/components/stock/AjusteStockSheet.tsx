import { useEffect } from 'react';
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
import { useMutateStockMovement } from '@/hooks/useMutateStockMovement';
import { useAuthContext } from '@vitalock/shared';
import type { MovementType } from '@/types/stock';

type ManualMovementType = Extract<
  MovementType,
  'compra' | 'devolucion' | 'ajuste_manual' | 'baja_defectuoso' | 'baja_perdida'
>;

const MANUAL_TYPES: { value: ManualMovementType; label: string; hint: string }[] = [
  { value: 'compra', label: 'Compra', hint: 'Suma stock. Cantidad positiva.' },
  { value: 'devolucion', label: 'Devolución', hint: 'Suma stock. Cantidad positiva.' },
  {
    value: 'ajuste_manual',
    label: 'Ajuste manual',
    hint: 'Diferencia de conteo. Positivo para sumar, negativo para restar.',
  },
  {
    value: 'baja_defectuoso',
    label: 'Baja por defectuoso',
    hint: 'Resta stock. Cantidad negativa.',
  },
  {
    value: 'baja_perdida',
    label: 'Baja por pérdida',
    hint: 'Resta stock. Cantidad negativa.',
  },
];

const schema = z
  .object({
    movement_type: z.enum([
      'compra',
      'devolucion',
      'ajuste_manual',
      'baja_defectuoso',
      'baja_perdida',
    ]),
    quantity: z
      .number({ invalid_type_error: 'Ingresá un número' })
      .refine((n) => n !== 0, 'La cantidad no puede ser 0'),
    unit_cost: z
      .number({ invalid_type_error: 'Ingresá un número' })
      .min(0, 'No puede ser negativo')
      .optional()
      .nullable(),
    note: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if ((data.movement_type === 'compra' || data.movement_type === 'devolucion') && data.quantity <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${data.movement_type === 'compra' ? 'Compra' : 'Devolución'} requiere cantidad positiva`,
        path: ['quantity'],
      });
    }
    if (
      (data.movement_type === 'baja_defectuoso' || data.movement_type === 'baja_perdida') &&
      data.quantity >= 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Las bajas requieren cantidad negativa (ej. -3)',
        path: ['quantity'],
      });
    }
  });

type FormValues = z.infer<typeof schema>;

export interface AjusteStockSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  productName: string;
  stockDisponible: number;
}

export function AjusteStockSheet({
  open,
  onOpenChange,
  productId,
  productName,
  stockDisponible,
}: AjusteStockSheetProps) {
  const { staff } = useAuthContext();
  const { createMovement } = useMutateStockMovement();

  const {
    control,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      movement_type: 'ajuste_manual',
      quantity: 0,
      unit_cost: null,
      note: '',
    },
  });

  const movementType = watch('movement_type');
  const quantity = watch('quantity');
  const showCost = movementType === 'compra' || movementType === 'devolucion';
  const isPending = createMovement.isPending || isSubmitting;

  useEffect(() => {
    if (!open) return;
    reset({
      movement_type: 'ajuste_manual',
      quantity: 0,
      unit_cost: null,
      note: '',
    });
  }, [open, reset]);

  const projectedStock = stockDisponible + (Number.isFinite(quantity) ? quantity : 0);
  const wouldGoNegative = projectedStock < 0;

  const onSubmit = async (values: FormValues) => {
    if (wouldGoNegative) return;
    await createMovement.mutateAsync({
      productId,
      movementType: values.movement_type,
      quantity: values.quantity,
      unitCost: showCost && values.unit_cost != null && values.unit_cost > 0 ? values.unit_cost : null,
      note: values.note?.trim() || null,
      actor_staff_id: staff?.id ?? null,
    });
    onOpenChange(false);
  };

  const activeTypeMeta = MANUAL_TYPES.find((t) => t.value === movementType);

  return (
    <Sheet open={open} onOpenChange={(o) => !isPending && onOpenChange(o)}>
      <SheetContent side="right" className="flex flex-col gap-0 sm:max-w-lg overflow-y-auto">
        <SheetHeader className="p-6 pb-4">
          <SheetTitle>Nuevo movimiento — {productName}</SheetTitle>
          <p className="text-sm text-muted-foreground">
            Stock disponible actual: <span className="font-medium">{stockDisponible}</span>
          </p>
        </SheetHeader>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-1 flex-col gap-6 px-6"
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="movement-type">Tipo *</Label>
            <Controller
              control={control}
              name="movement_type"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={(v) => field.onChange(v as ManualMovementType)}
                >
                  <SelectTrigger id="movement-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MANUAL_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {activeTypeMeta && (
              <p className="text-xs text-muted-foreground">{activeTypeMeta.hint}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="movement-quantity">Cantidad *</Label>
            <Controller
              control={control}
              name="quantity"
              render={({ field }) => (
                <Input
                  id="movement-quantity"
                  type="number"
                  step="1"
                  value={field.value ?? ''}
                  onChange={(e) => field.onChange(e.target.value === '' ? 0 : Number(e.target.value))}
                />
              )}
            />
            {errors.quantity && (
              <p className="text-sm text-destructive">{errors.quantity.message}</p>
            )}
            {!errors.quantity && quantity !== 0 && (
              <p className={`text-xs ${wouldGoNegative ? 'text-destructive' : 'text-muted-foreground'}`}>
                Stock resultante: {projectedStock}
                {wouldGoNegative && ' — el movimiento dejaría el stock en negativo'}
              </p>
            )}
          </div>

          {showCost && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="movement-cost">Costo unitario (opcional)</Label>
              <Controller
                control={control}
                name="unit_cost"
                render={({ field }) => (
                  <Input
                    id="movement-cost"
                    type="number"
                    step="0.01"
                    min="0"
                    value={field.value ?? ''}
                    onChange={(e) =>
                      field.onChange(e.target.value === '' ? null : Number(e.target.value))
                    }
                  />
                )}
              />
              {errors.unit_cost && (
                <p className="text-sm text-destructive">{errors.unit_cost.message}</p>
              )}
              {movementType === 'compra' && (
                <p className="text-xs text-muted-foreground">
                  Si el costo es mayor a 0, actualiza el precio de costo del producto.
                </p>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="movement-note">Nota</Label>
            <Controller
              control={control}
              name="note"
              render={({ field }) => (
                <Input
                  id="movement-note"
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  placeholder="Motivo del movimiento..."
                />
              )}
            />
          </div>

          <SheetFooter className="mt-auto flex-row gap-2 border-t p-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending || wouldGoNegative}>
              {isPending ? 'Registrando...' : 'Registrar movimiento'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
