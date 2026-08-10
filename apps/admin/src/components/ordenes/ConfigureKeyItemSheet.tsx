import { useState } from 'react';
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
import { useMutateOrderItem } from '@/hooks/useMutateOrderItem';
import { useUnits } from '@/hooks/useUnits';
import { useEquipment } from '@/hooks/useEquipment';
import { toastMutationError } from '@/hooks/mapMutationError';
import { QuickUnitCreateDialog } from './QuickUnitCreateDialog';
import type { OrderItemRow } from '@/hooks/useOrden';

const schema = z.object({
  rfid_code: z.string().min(1, 'El código RFID es obligatorio'),
  unit_id: z.string().min(1, 'La unidad es obligatoria'),
  equipment_ids: z.array(z.string()),
});

type FormValues = z.infer<typeof schema>;

interface ConfigureKeyItemSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: OrderItemRow;
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

  const { configureKeyItem } = useMutateOrderItem();
  const { data: units = [] } = useUnits(buildingId);
  const { data: equipment = [] } = useEquipment(buildingId);

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

  const handleUnitCreated = (unitId: string) => {
    setValue('unit_id', unitId, { shouldValidate: true });
  };

  const onSubmit = async (values: FormValues) => {
    try {
      await configureKeyItem.mutateAsync({
        orderItemId: item.id,
        orderId,
        rfidCode: values.rfid_code,
        unitId: values.unit_id,
        equipmentIds: values.equipment_ids,
        buildingId,
      });
      reset();
      onOpenChange(false);
    } catch (err) {
      toastMutationError(err as Error);
    }
  };

  const isPending = configureKeyItem.isPending || isSubmitting;

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(v) => {
          if (!v) reset();
          onOpenChange(v);
        }}
      >
        <SheetContent side="right" className="flex flex-col gap-0 sm:max-w-md overflow-y-auto">
          <SheetHeader className="p-6 pb-4">
            <SheetTitle>Configurar llave</SheetTitle>
          </SheetHeader>

          <form
            onSubmit={handleSubmit(onSubmit)}
            className="flex flex-1 flex-col gap-6 px-6"
          >
            {/* RFID Code */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="rfid-code">Código RFID *</Label>
              <Input
                id="rfid-code"
                placeholder="Ej. AABBCC112233"
                {...register('rfid_code')}
              />
              {errors.rfid_code && (
                <p className="text-sm text-destructive">{errors.rfid_code.message}</p>
              )}
            </div>

            {/* Unit select + QuickUnitCreateDialog trigger */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="unit-id">Unidad *</Label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Controller
                    control={control}
                    name="unit_id"
                    render={({ field }) => (
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger id="unit-id">
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
              {errors.unit_id && (
                <p className="text-sm text-destructive">{errors.unit_id.message}</p>
              )}
            </div>

            {/* Equipment multi-select */}
            {equipment.length > 0 && (
              <div className="flex flex-col gap-2">
                <Label>Equipos autorizados (opcional)</Label>
                <div className="flex flex-col gap-2 rounded-md border p-3 max-h-48 overflow-y-auto">
                  <Controller
                    control={control}
                    name="equipment_ids"
                    render={({ field }) => (
                      <>
                        {equipment.map((eq) => {
                          const checked = field.value.includes(eq.id);
                          return (
                            <label
                              key={eq.id}
                              className="flex items-center gap-2 cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    field.onChange([...field.value, eq.id]);
                                  } else {
                                    field.onChange(
                                      field.value.filter((id) => id !== eq.id),
                                    );
                                  }
                                }}
                                className="h-4 w-4 rounded border-input"
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
              </div>
            )}

            <SheetFooter className="mt-auto pt-4 pb-6">
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
