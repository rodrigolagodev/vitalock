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
} from '@/components/ui/sheet';
import { Button } from '@vitalock/ui';
import { Input } from '@vitalock/ui';
import { Label } from '@/components/ui/label';
import { Switch } from '@vitalock/ui';
import { useMutateUnit } from '@/hooks/useMutateUnit';
import type { UnitRow } from '@/hooks/useUnits';

const schema = z.object({
  number: z.string().min(1, 'El número/identificador es obligatorio'),
  is_administrative: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

interface UnitFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buildingId: string;
  unit?: Pick<UnitRow, 'id' | 'number' | 'is_administrative'> | null;
}

export function UnitFormSheet({
  open,
  onOpenChange,
  buildingId,
  unit,
}: UnitFormSheetProps) {
  const isEdit = Boolean(unit);
  const { createUnit, updateUnit } = useMutateUnit(buildingId);

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { number: '', is_administrative: false },
  });

  useEffect(() => {
    if (open) {
      reset({
        number: unit?.number ?? '',
        is_administrative: unit?.is_administrative ?? false,
      });
    }
  }, [open, unit, reset]);

  const onSubmit = async (values: FormValues) => {
    if (isEdit && unit) {
      await updateUnit.mutateAsync({
        id: unit.id,
        number: values.number,
        is_administrative: values.is_administrative,
      });
    } else {
      await createUnit.mutateAsync({
        building_id: buildingId,
        number: values.number,
        is_administrative: values.is_administrative,
      });
    }
    onOpenChange(false);
  };

  const isPending = createUnit.isPending || updateUnit.isPending;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col gap-0 sm:max-w-md">
        <SheetHeader className="p-6 pb-4">
          <SheetTitle>
            {isEdit ? 'Editar unidad' : 'Nueva unidad'}
          </SheetTitle>
        </SheetHeader>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-1 flex-col gap-6 overflow-y-auto px-6"
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="number">Número / Identificador *</Label>
            <Input
              id="number"
              {...register('number')}
              placeholder="Ej. 101, PB-A"
            />
            {errors.number && (
              <p className="text-sm text-destructive">{errors.number.message}</p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Controller
              control={control}
              name="is_administrative"
              render={({ field }) => (
                <Switch
                  id="is_administrative"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              )}
            />
            <Label htmlFor="is_administrative">Unidad administrativa</Label>
          </div>

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
              {isPending || isSubmitting ? 'Guardando...' : 'Guardar'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
