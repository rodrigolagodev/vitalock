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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useMutateParticular } from '@/hooks/useMutateParticular';
import { useBuildings } from '@/hooks/useBuildings';
import { useUnits } from '@/hooks/useUnits';
import { toastMutationError } from '@/hooks/mapMutationError';
import type { ParticularRow } from '@/hooks/useParticulares';

// ---- Zod schema ----

const schema = z.object({
  full_name: z.string().min(1, 'El nombre es obligatorio'),
  dni: z.string().min(1, 'El DNI es obligatorio'),
  phone: z.string().optional(),
  email: z
    .string()
    .email('Email inválido')
    .optional()
    .or(z.literal('')),
  building_id: z.string().min(1, 'El edificio es obligatorio'),
  unit_id: z.string().min(1, 'La unidad es obligatoria'),
});

type FormValues = z.infer<typeof schema>;

interface ParticularFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  particular?: ParticularRow | null;
}

/**
 * Create/edit sheet for particulares (StaffFormSheet pattern). Unit is a
 * required two-step: building → unit (useBuildings/useUnits), enforcing the
 * 1:1 unit binding. On edit the building select is prefilled from the row's
 * unit embed (unit_building_id).
 */
export function ParticularFormSheet({
  open,
  onOpenChange,
  particular,
}: ParticularFormSheetProps) {
  const isEdit = Boolean(particular);
  const { createParticular, updateParticular } = useMutateParticular();
  const { data: buildings = [] } = useBuildings();

  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      full_name: '',
      dni: '',
      phone: '',
      email: '',
      building_id: '',
      unit_id: '',
    },
  });

  const buildingId = watch('building_id');
  const { data: units = [] } = useUnits(buildingId);

  useEffect(() => {
    if (open) {
      reset({
        full_name: particular?.full_name ?? '',
        dni: particular?.dni ?? '',
        phone: particular?.phone ?? '',
        email: particular?.email ?? '',
        building_id: particular?.unit_building_id ?? '',
        unit_id: particular?.unit_id ?? '',
      });
    }
  }, [open, particular, reset]);

  const onSubmit = async (values: FormValues) => {
    try {
      if (isEdit && particular) {
        await updateParticular.mutateAsync({
          id: particular.id,
          unit_id: values.unit_id,
          dni: values.dni.trim(),
          full_name: values.full_name.trim(),
          phone: values.phone?.trim() || null,
          email: values.email?.trim() || null,
        });
      } else {
        await createParticular.mutateAsync({
          unit_id: values.unit_id,
          dni: values.dni.trim(),
          full_name: values.full_name.trim(),
          phone: values.phone?.trim() || null,
          email: values.email?.trim() || null,
        });
      }
      onOpenChange(false);
    } catch (err) {
      toastMutationError(err as Error);
    }
  };

  const isPending = createParticular.isPending || updateParticular.isPending;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col gap-0 sm:max-w-md">
        <SheetHeader className="p-6 pb-4">
          <SheetTitle>
            {isEdit ? 'Editar particular' : 'Nuevo particular'}
          </SheetTitle>
        </SheetHeader>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-1 flex-col gap-6 overflow-y-auto px-6"
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="particular-full-name">Nombre *</Label>
            <Input
              id="particular-full-name"
              placeholder="Ej. Juan García"
              {...register('full_name')}
            />
            {errors.full_name && (
              <p className="text-sm text-destructive">{errors.full_name.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="particular-dni">DNI *</Label>
            <Input
              id="particular-dni"
              placeholder="Ej. 28123456"
              {...register('dni')}
            />
            {errors.dni && (
              <p className="text-sm text-destructive">{errors.dni.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="particular-phone">Teléfono</Label>
            <Input
              id="particular-phone"
              placeholder="Ej. +54 11 1234-5678"
              {...register('phone')}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="particular-email">Email</Label>
            <Input
              id="particular-email"
              type="email"
              placeholder="Ej. juan@mail.com"
              {...register('email')}
            />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="particular-building">Edificio *</Label>
            <Controller
              control={control}
              name="building_id"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={(v) => {
                    field.onChange(v);
                    // A unit belongs to one building — reset the previous pick.
                    setValue('unit_id', '');
                  }}
                >
                  <SelectTrigger id="particular-building">
                    <SelectValue placeholder="Seleccioná un edificio" />
                  </SelectTrigger>
                  <SelectContent>
                    {buildings.map((building) => (
                      <SelectItem key={building.id} value={building.id}>
                        {building.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.building_id && (
              <p className="text-sm text-destructive">
                {errors.building_id.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="particular-unit">Unidad *</Label>
            <Controller
              control={control}
              name="unit_id"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={!buildingId}
                >
                  <SelectTrigger id="particular-unit">
                    <SelectValue
                      placeholder={
                        buildingId ? 'Seleccioná una unidad' : 'Elegí primero un edificio'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {units.map((unit) => (
                      <SelectItem key={unit.id} value={unit.id}>
                        {unit.number}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.unit_id && (
              <p className="text-sm text-destructive">{errors.unit_id.message}</p>
            )}
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
