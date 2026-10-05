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
import { Textarea } from '@vitalock/ui';
import { useDecommissionImpact } from '@/hooks/useDecommissionImpact';
import type { UpdateStatusInput } from '@/hooks/useMutateEquipment';

const schema = z.object({
  decommission_reason: z.string().min(1, 'El motivo de baja es obligatorio'),
});

type FormValues = z.infer<typeof schema>;

interface DecommissionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  equipmentId: string;
  onConfirm: (input: {
    id: string;
    status: UpdateStatusInput['status'];
    decommission_reason: string;
  }) => void;
  isPending?: boolean;
}

/**
 * Decommission flow dialog.
 * - Fetches impact count (key_authorizations in pending_install/pending_removal) while open.
 * - Requires a non-empty decommission_reason before confirm is enabled.
 * - On cancel: no mutation fires and parent should revert the status selector.
 */
export function DecommissionDialog({
  open,
  onOpenChange,
  equipmentId,
  onConfirm,
  isPending,
}: DecommissionDialogProps) {
  const { data: impactCount, isLoading: impactLoading } = useDecommissionImpact(equipmentId, open);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { decommission_reason: '' },
  });

  useEffect(() => {
    if (open) {
      reset({ decommission_reason: '' });
    }
  }, [open, reset]);

  const onSubmit = (values: FormValues) => {
    onConfirm({
      id: equipmentId,
      status: 'dead',
      decommission_reason: values.decommission_reason,
    });
  };

  const count = impactCount ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Dar de baja equipo</DialogTitle>
          <DialogDescription>
            Esta acción es irreversible. El equipo quedará en estado &quot;Dado de baja&quot;.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          {/* Impact preview */}
          <div className="bg-muted/50 rounded-md border p-3 text-sm">
            {impactLoading ? (
              <span className="text-muted-foreground">Calculando impacto...</span>
            ) : (
              <span>
                <strong>{count}</strong>{' '}
                {count === 1
                  ? 'autorización pendiente se cerrará'
                  : 'autorizaciones pendientes se cerrarán'}{' '}
                con esta baja.
              </span>
            )}
          </div>

          {/* Reason */}
          <FormField
            label="Motivo de baja *"
            id="decommission_reason"
            error={errors.decommission_reason?.message}
          >
            <Textarea
              placeholder="Describí el motivo de la baja del equipo..."
              rows={3}
              {...register('decommission_reason')}
            />
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
            <Button type="submit" variant="destructive" disabled={isPending || isSubmitting}>
              {isPending || isSubmitting ? 'Procesando...' : 'Confirmar baja'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
