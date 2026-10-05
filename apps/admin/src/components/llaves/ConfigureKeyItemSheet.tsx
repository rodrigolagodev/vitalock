import { useEffect, useMemo, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter, FormField } from '@vitalock/ui';
import { Button } from '@vitalock/ui';
import { Input } from '@vitalock/ui';
import { Label } from '@vitalock/ui';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@vitalock/ui';
import { useMutateKeyOrder } from '@/hooks/useMutateKeyOrder';
import { useUnits } from '@/hooks/useUnits';
import { useEquipment } from '@/hooks/useEquipment';
import { toastMutationError } from '@/lib/errors/toast';
import { QuickUnitCreateDialog } from '@/components/llaves/QuickUnitCreateDialog';
import type { KeyOrderItemRow } from '@/hooks/useKeyOrder';

const schema = z.object({
  rfid_code: z.string().min(1, 'El código RFID es obligatorio'),
  unit_id: z.string().min(1, 'La unidad es obligatoria'),
  equipment_ids: z.array(z.string()).min(1, 'Seleccioná al menos un equipo'),
});

type FormValues = z.infer<typeof schema>;

interface ConfigureKeyItemSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: KeyOrderItemRow;
  orderId: string;
}

export function ConfigureKeyItemSheet({
  open,
  onOpenChange,
  item,
  orderId,
}: ConfigureKeyItemSheetProps) {
  const [quickUnitOpen, setQuickUnitOpen] = useState(false);

  const buildingId = item.building_id ?? '';

  const { configureKeyOrderItem } = useMutateKeyOrder();
  const { data: units = [] } = useUnits(buildingId);
  const { data: equipment = [] } = useEquipment(buildingId, { activeOnly: true });

  // Only active readers can be assigned to a new key.
  const activeEquipment = equipment.filter((eq) => eq.status === 'active');

  const {
    register,
    handleSubmit,
    control,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      rfid_code: '',
      unit_id: '',
      equipment_ids: [],
    },
  });

  // Prefill unit_id from the item when the sheet opens.
  useEffect(() => {
    if (open) {
      reset({
        rfid_code: '',
        unit_id: item.unit_id ?? '',
        equipment_ids: [],
      });
    }
  }, [open, item.unit_id, reset]);

  const prefilledUnit = useMemo(
    () => (item.unit_id ? (units.find((u) => u.id === item.unit_id) ?? null) : null),
    [item.unit_id, units],
  );
  const hasPrefilledUnit = Boolean(item.unit_id);

  const handleUnitCreated = (unitId: string) => {
    setValue('unit_id', unitId, { shouldValidate: true });
  };

  const onSubmit = async (values: FormValues) => {
    try {
      await configureKeyOrderItem.mutateAsync({
        orderItemId: item.id,
        orderId,
        rfidCode: values.rfid_code,
        unitId: values.unit_id,
        equipmentIds: values.equipment_ids,
      });
      reset();
      onOpenChange(false);
    } catch (err) {
      toastMutationError(err as Error);
    }
  };

  const isPending = configureKeyOrderItem.isPending || isSubmitting;

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(v) => {
          if (!v) reset();
          onOpenChange(v);
        }}
      >
        <SheetContent side="right" className="flex flex-col gap-0 overflow-y-auto sm:max-w-md">
          <SheetHeader className="p-6 pb-4">
            <SheetTitle>Configurar llave</SheetTitle>
          </SheetHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 flex-col gap-6 px-6">
            {/* RFID Code */}
            <FormField label="Código RFID *" id="rfid-code" error={errors.rfid_code?.message}>
              <Input placeholder="Ej. AABBCC112233" {...register('rfid_code')} />
            </FormField>

            {/* Unit — readonly when the item already carries a unit_id */}
            {hasPrefilledUnit ? (
              <div className="flex flex-col gap-2">
                <Label>Unidad</Label>
                <p className="bg-muted/40 rounded-md border px-3 py-2 text-sm">
                  {prefilledUnit
                    ? `${prefilledUnit.number}${prefilledUnit.unit_type ? ` — ${prefilledUnit.unit_type}` : ''}`
                    : 'Cargando...'}
                </p>
              </div>
            ) : (
              <FormField label="Unidad *" id="unit-id" error={errors.unit_id?.message}>
                {(a11y) => (
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <Controller
                        control={control}
                        name="unit_id"
                        render={({ field }) => (
                          <Select value={field.value} onValueChange={field.onChange}>
                            <SelectTrigger {...a11y}>
                              <SelectValue placeholder="Seleccioná una unidad" />
                            </SelectTrigger>
                            <SelectContent>
                              {units.map((u) => (
                                <SelectItem key={u.id} value={u.id}>
                                  {u.number}
                                  {u.unit_type ? ` — ${u.unit_type}` : ''}
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
                      className="shrink-0"
                    >
                      Nueva unidad
                    </Button>
                  </div>
                )}
              </FormField>
            )}

            {/* Equipment multi-select */}
            <FormField
              label="Equipos autorizados *"
              id="equipment-ids"
              error={errors.equipment_ids?.message}
            >
              {(a11y) => (
                <>
                  {activeEquipment.length === 0 ? (
                    <p className="text-muted-foreground rounded-md border border-dashed px-3 py-2 text-sm">
                      No hay equipos activos disponibles en este edificio. Creá o activá al menos
                      uno antes de configurar la llave.
                    </p>
                  ) : (
                    <div
                      {...a11y}
                      role="group"
                      className="flex max-h-48 flex-col gap-2 overflow-y-auto rounded-md border p-3"
                    >
                      <Controller
                        control={control}
                        name="equipment_ids"
                        render={({ field }) => (
                          <>
                            {activeEquipment.map((eq) => {
                              const checked = field.value.includes(eq.id);
                              return (
                                <label
                                  key={eq.id}
                                  className="flex cursor-pointer items-center gap-2"
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        field.onChange([...field.value, eq.id]);
                                      } else {
                                        field.onChange(field.value.filter((id) => id !== eq.id));
                                      }
                                    }}
                                    className="border-input h-4 w-4 rounded"
                                  />
                                  <span className="text-sm">
                                    {eq.serial_number}
                                    {eq.model ? ` — ${eq.model}` : ''}
                                  </span>
                                </label>
                              );
                            })}
                          </>
                        )}
                      />
                    </div>
                  )}
                </>
              )}
            </FormField>

            <SheetFooter className="mt-auto pb-6 pt-4">
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
                {isPending ? 'Guardando...' : 'Guardar'}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {/* QuickUnitCreateDialog — rendered outside Sheet to avoid nesting portals */}
      <QuickUnitCreateDialog
        open={quickUnitOpen}
        onOpenChange={setQuickUnitOpen}
        buildingId={buildingId}
        onCreated={handleUnitCreated}
      />
    </>
  );
}
