import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  FormField,
} from '@vitalock/ui';
import { Button } from '@vitalock/ui';
import { Input } from '@vitalock/ui';
import { Label } from '@vitalock/ui';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@vitalock/ui';
import { BuildingCombobox } from '@/components/buildings/BuildingCombobox';
import { QuickUnitCreateDialog } from '@/components/llaves/QuickUnitCreateDialog';
import { useMutateParticular } from '@/hooks/useMutateParticular';
import { useBuildings } from '@/hooks/useBuildings';
import { useUnits } from '@/hooks/useUnits';
import { toastMutationError } from '@/lib/errors/toast';
import type { ParticularRow } from '@/hooks/useParticulares';

const schema = z.object({
  full_name: z.string().min(1, 'El nombre es obligatorio'),
  dni: z.string().min(1, 'El DNI es obligatorio'),
  phone: z.string().optional(),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  building_id: z.string().optional(),
  unit_id: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface QuickParticularCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Emits the FULL created row (not just the id) so the enclosing flow can
   * bind the particular and autofill the flat snapshot fields
   * (full_name/dni/phone/email) without an extra fetch.
   */
  onCreated: (particular: ParticularRow) => void;
}

/**
 * Inline particular creation (QuickUnitCreateDialog pattern). Building and unit
 * are both optional — a particular can exist without a unit binding, but when
 * one is chosen the two-step (building → unit) enforces the 1:1 unit binding.
 * The building picker is a searchable combobox (name + address).
 */
export function QuickParticularCreateDialog({
  open,
  onOpenChange,
  onCreated,
}: QuickParticularCreateDialogProps) {
  const { createParticular } = useMutateParticular();
  const { data: buildings = [] } = useBuildings();
  const [quickUnitOpen, setQuickUnitOpen] = useState(false);

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

  const buildingId = watch('building_id') ?? '';
  const { data: units = [] } = useUnits(buildingId);

  const handleUnitCreated = (unitId: string) => {
    setValue('unit_id', unitId, { shouldValidate: true });
  };

  const onSubmit = async (values: FormValues) => {
    try {
      const created = await createParticular.mutateAsync({
        unit_id: values.unit_id?.trim() ? values.unit_id : null,
        dni: values.dni.trim(),
        full_name: values.full_name.trim(),
        phone: values.phone?.trim() || null,
        email: values.email?.trim() || null,
      });
      onCreated(created as ParticularRow);
      reset();
      onOpenChange(false);
    } catch (err) {
      toastMutationError(err as Error);
    }
  };

  const isPending = createParticular.isPending || isSubmitting;

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!v) reset();
          onOpenChange(v);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Crear particular</DialogTitle>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              // Portals bubble React events up the virtual tree — stop the
              // submit here so any enclosing parent form doesn't also submit.
              e.stopPropagation();
              void handleSubmit(onSubmit)(e);
            }}
            className="flex flex-col gap-4"
          >
            {/* Full name */}
            <FormField
              label="Nombre completo *"
              id="quick-particular-full-name"
              error={errors.full_name?.message}
            >
              <Input placeholder="Ej. Juan García" {...register('full_name')} />
            </FormField>

            {/* DNI */}
            <FormField label="DNI *" id="quick-particular-dni" error={errors.dni?.message}>
              <Input placeholder="Ej. 28123456" {...register('dni')} />
            </FormField>

            {/* Phone / email */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="quick-particular-phone">Teléfono</Label>
              <Input
                id="quick-particular-phone"
                placeholder="Ej. +54 11 1234-5678"
                {...register('phone')}
              />
            </div>

            <FormField label="Email" id="quick-particular-email" error={errors.email?.message}>
              <Input type="email" placeholder="Ej. juan@mail.com" {...register('email')} />
            </FormField>

            {/* Building searchable combobox (name + address) */}
            <FormField
              label="Edificio"
              id="quick-particular-building"
              error={errors.building_id?.message}
            >
              {(a11y) => (
                <Controller
                  control={control}
                  name="building_id"
                  render={({ field }) => (
                    <BuildingCombobox
                      {...a11y}
                      buildings={buildings}
                      value={field.value}
                      onChange={(v) => {
                        field.onChange(v ?? '');
                        // A unit belongs to one building — reset the previous pick.
                        setValue('unit_id', '');
                      }}
                      placeholder="Buscar por nombre o dirección"
                    />
                  )}
                />
              )}
            </FormField>

            {/* Unit select + inline creation */}
            <FormField label="Unidad" id="quick-particular-unit" error={errors.unit_id?.message}>
              {(a11y) => (
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Controller
                      control={control}
                      name="unit_id"
                      render={({ field }) => (
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                          disabled={!buildingId}
                        >
                          <SelectTrigger {...a11y}>
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
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setQuickUnitOpen(true)}
                    disabled={!buildingId}
                    className="shrink-0"
                  >
                    Nueva
                  </Button>
                </div>
              )}
            </FormField>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  reset();
                  onOpenChange(false);
                }}
                disabled={isPending}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Creando...' : 'Crear'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {buildingId && (
        <QuickUnitCreateDialog
          open={quickUnitOpen}
          onOpenChange={setQuickUnitOpen}
          buildingId={buildingId}
          onCreated={handleUnitCreated}
        />
      )}
    </>
  );
}
