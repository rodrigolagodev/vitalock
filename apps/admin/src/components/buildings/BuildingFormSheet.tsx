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
import { useMutateBuilding } from '@/hooks/useMutateBuilding';
import { useAdministrations } from '@/hooks/useAdministrations';
import type { BuildingRow } from '@/hooks/useBuildings';

const schema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio'),
  address: z.string().optional(),
  administration_id: z.string().uuid('Seleccioná una administración'),
});

type FormValues = z.infer<typeof schema>;

interface BuildingFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  building?: Pick<BuildingRow, 'id' | 'name' | 'address' | 'administration_id'> | null;
  /** When provided, the administration Select is hidden and this id is pre-filled. */
  administrationId?: string;
}

export function BuildingFormSheet({
  open,
  onOpenChange,
  building,
  administrationId,
}: BuildingFormSheetProps) {
  const isEdit = Boolean(building);
  const { createBuilding, updateBuilding } = useMutateBuilding();
  const { data: administrations = [], isLoading: adminsLoading } = useAdministrations();

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', address: '', administration_id: '' },
  });

  useEffect(() => {
    if (open) {
      reset({
        name: building?.name ?? '',
        address: building?.address ?? '',
        // When administrationId prop is supplied, use it unconditionally (pre-fill from context)
        administration_id: administrationId ?? building?.administration_id ?? '',
      });
    }
  }, [open, building, administrationId, reset]);

  const onSubmit = async (values: FormValues) => {
    if (isEdit && building) {
      await updateBuilding.mutateAsync({
        id: building.id,
        name: values.name,
        address: values.address,
      });
    } else {
      await createBuilding.mutateAsync({
        name: values.name,
        address: values.address || null,
        administration_id: values.administration_id,
      });
    }
    onOpenChange(false);
  };

  const isPending = createBuilding.isPending || updateBuilding.isPending;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col gap-0 sm:max-w-md">
        <SheetHeader className="p-6 pb-4">
          <SheetTitle>
            {isEdit ? 'Editar edificio' : 'Nuevo edificio'}
          </SheetTitle>
        </SheetHeader>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-1 flex-col gap-6 overflow-y-auto px-6"
        >
          {!isEdit && !administrationId && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="administration_id">Administración *</Label>
              <Controller
                control={control}
                name="administration_id"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={adminsLoading}
                  >
                    <SelectTrigger id="administration_id">
                      <SelectValue placeholder={adminsLoading ? 'Cargando...' : 'Elegí una administración'} />
                    </SelectTrigger>
                    <SelectContent>
                      {administrations.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.company_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.administration_id && (
                <p className="text-sm text-destructive">{errors.administration_id.message}</p>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Nombre *</Label>
            <Input id="name" {...register('name')} placeholder="Ej. Torre Callao" />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="address">Dirección</Label>
            <Input
              id="address"
              {...register('address')}
              placeholder="Ej. Av. Callao 1234, CABA"
            />
            {errors.address && (
              <p className="text-sm text-destructive">{errors.address.message}</p>
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
