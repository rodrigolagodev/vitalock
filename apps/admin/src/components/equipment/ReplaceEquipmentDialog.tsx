import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
  FormField,
} from '@vitalock/ui';
import { Button } from '@vitalock/ui';
import { Input } from '@vitalock/ui';
import { useReplaceEquipment } from '@/hooks/useReplaceEquipment';
import type { EquipmentRow } from '@/hooks/useEquipment';

const schema = z.object({
  new_serial_number: z.string().min(1, 'El número de serie es obligatorio'),
  new_model: z.string().min(1, 'El modelo es obligatorio'),
});

type FormValues = z.infer<typeof schema>;

interface ReplaceEquipmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  equipment: EquipmentRow;
  buildingId: string;
}

/**
 * Replacement flow dialog.
 * Invokes operations.replace_equipment() RPC — atomically marks old device dead,
 * creates new device with replaces_equipment_id pointing to old, migrates authorizations.
 * On error: toast only (RPC is atomic — no partial state visible).
 */
export function ReplaceEquipmentDialog({
  open,
  onOpenChange,
  equipment,
  buildingId,
}: ReplaceEquipmentDialogProps) {
  const { replaceEquipment } = useReplaceEquipment(buildingId);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { new_serial_number: '', new_model: '' },
  });

  useEffect(() => {
    if (open) {
      reset({ new_serial_number: '', new_model: equipment.model ?? '' });
    }
  }, [open, equipment, reset]);

  const onSubmit = async (values: FormValues) => {
    await replaceEquipment.mutateAsync({
      old_equipment_id: equipment.id,
      new_serial_number: values.new_serial_number,
      new_model: values.new_model,
    });
    onOpenChange(false);
  };

  const isPending = replaceEquipment.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reemplazar equipo</DialogTitle>
          <DialogDescription>
            El equipo actual quedará dado de baja y las autorizaciones instaladas migrarán al nuevo
            dispositivo.
          </DialogDescription>
        </DialogHeader>

        {/* Old device reference (read-only) */}
        <div className="bg-muted/50 space-y-1 rounded-md border p-3 text-sm">
          <p className="text-muted-foreground font-medium">Equipo actual</p>
          <p>
            <span className="font-medium">Serie:</span> {equipment.serial_number}
          </p>
          <p>
            <span className="font-medium">Modelo:</span> {equipment.model ?? '—'}
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <FormField
            label="Número de serie del nuevo equipo *"
            id="new_serial_number"
            error={errors.new_serial_number?.message}
          >
            <Input placeholder="Ej. SN-987654321" {...register('new_serial_number')} />
          </FormField>

          <FormField
            label="Modelo del nuevo equipo *"
            id="new_model"
            error={errors.new_model?.message}
          >
            <Input placeholder="Ej. Smart Lock Pro v2" {...register('new_model')} />
          </FormField>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending || isSubmitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending || isSubmitting}>
              {isPending || isSubmitting ? 'Procesando...' : 'Confirmar reemplazo'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
