import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter, FormField } from '@vitalock/ui';
import { Button } from '@vitalock/ui';
import { Input } from '@vitalock/ui';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@vitalock/ui';
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
          <SheetTitle>{isEdit ? 'Editar edificio' : 'Nuevo edificio'}</SheetTitle>
        </SheetHeader>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-1 flex-col gap-6 overflow-y-auto px-6"
        >
          {!isEdit && !administrationId && (
            <FormField
              label="Administración *"
              id="administration_id"
              error={errors.administration_id?.message}
            >
              {(a11y) => (
                <Controller
                  control={control}
                  name="administration_id"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={adminsLoading}
                    >
                      <SelectTrigger {...a11y}>
                        <SelectValue
                          placeholder={adminsLoading ? 'Cargando...' : 'Elegí una administración'}
                        />
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
              )}
            </FormField>
          )}

          <FormField label="Nombre *" id="name" error={errors.name?.message}>
            <Input {...register('name')} placeholder="Ej. Torre Callao" />
          </FormField>

          <FormField label="Dirección" id="address" error={errors.address?.message}>
            <Input {...register('address')} placeholder="Ej. Av. Callao 1234, CABA" />
          </FormField>

          <SheetFooter className="mt-auto pb-6 pt-4">
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
