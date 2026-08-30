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
} from '@vitalock/ui';
import { Button } from '@vitalock/ui';
import { Input } from '@vitalock/ui';
import { Label } from '@vitalock/ui';
import { useMutateKey } from '@/hooks/useMutateKey';
import { toastMutationError } from '@/lib/errors/toast';
import type { KeyOrderItemRow } from '@/hooks/useKeyOrder';

const schema = z.object({
  picked_up_by_name: z.string().min(1, 'El nombre es obligatorio'),
  picked_up_by_surname: z.string().optional(),
  picked_up_by_dni: z.string().min(1, 'El DNI es obligatorio'),
});

type FormValues = z.infer<typeof schema>;

export interface PickupPersonPrefill {
  full_name: string;
  dni: string;
}

interface PickupKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Key item whose produced key is being handed over. */
  item: KeyOrderItemRow;
  orderId: string;
  /** Authorized pickup person — prefills name/surname/dni when provided. */
  pickupPerson?: PickupPersonPrefill | null;
}

function splitFullName(fullName: string) {
  const [first = '', ...rest] = fullName.trim().split(/\s+/);
  return { name: first, surname: rest.join(' ') };
}

/**
 * Per-key pickup registration for key orders. Submits via
 * useMutateKey.recordPickup → rpc record_order_key_pickup.
 */
export function PickupKeyDialog({
  open,
  onOpenChange,
  item,
  orderId,
  pickupPerson,
}: PickupKeyDialogProps) {
  const { recordPickup } = useMutateKey(item.building_id ?? undefined);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      picked_up_by_name: '',
      picked_up_by_surname: '',
      picked_up_by_dni: '',
    },
  });

  useEffect(() => {
    if (!open) return;
    const prefilled = pickupPerson ? splitFullName(pickupPerson.full_name) : null;
    reset({
      picked_up_by_name: prefilled?.name ?? '',
      picked_up_by_surname: prefilled?.surname ?? '',
      picked_up_by_dni: pickupPerson?.dni ?? '',
    });
  }, [open, pickupPerson, reset]);

  const hasProducedKey = Boolean(item.produced_key_id);

  const onSubmit = async (values: FormValues) => {
    if (!item.produced_key_id) return;
    try {
      await recordPickup.mutateAsync({
        order_id: orderId,
        key_id: item.produced_key_id,
        picked_up_by_name: values.picked_up_by_name.trim(),
        picked_up_by_surname: values.picked_up_by_surname?.trim() || '',
        picked_up_by_dni: values.picked_up_by_dni.trim(),
      });
      reset();
      onOpenChange(false);
    } catch (err) {
      toastMutationError(err as Error);
    }
  };

  const isPending = recordPickup.isPending || isSubmitting;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Registrar retiro</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          {item.description && (
            <p className="text-sm text-muted-foreground">{item.description}</p>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="pickup-key-name">Nombre *</Label>
            <Input
              id="pickup-key-name"
              placeholder="Ej. Juan"
              {...register('picked_up_by_name')}
            />
            {errors.picked_up_by_name && (
              <p className="text-sm text-destructive">
                {errors.picked_up_by_name.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="pickup-key-surname">Apellido</Label>
            <Input
              id="pickup-key-surname"
              placeholder="Ej. García"
              {...register('picked_up_by_surname')}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="pickup-key-dni">DNI *</Label>
            <Input
              id="pickup-key-dni"
              placeholder="Ej. 28123456"
              {...register('picked_up_by_dni')}
            />
            {errors.picked_up_by_dni && (
              <p className="text-sm text-destructive">
                {errors.picked_up_by_dni.message}
              </p>
            )}
          </div>

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
            <Button type="submit" disabled={isPending || !hasProducedKey}>
              {isPending ? 'Registrando...' : 'Registrar retiro'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
