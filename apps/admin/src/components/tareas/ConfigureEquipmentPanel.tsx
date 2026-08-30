import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Input, Label, SectionHeading } from '@vitalock/ui';
import { useConfigureTechnicalTicketEquipment } from '@/hooks/useConfigureTechnicalTicketEquipment';
import type { TareaDetailRow } from '@/hooks/useTarea';

interface ConfigureEquipmentPanelProps {
  tarea: TareaDetailRow;
}

const schema = z.object({
  serial: z.string().trim().min(1, 'El número de serie es obligatorio'),
  model: z.string().trim(),
});
type FormValues = z.infer<typeof schema>;

const CATEGORY_HEADINGS: Record<'equipment_installation' | 'equipment_replacement', string> = {
  equipment_installation: 'Equipo a instalar',
  equipment_replacement: 'Equipo de reemplazo',
};

const EMPTY_HELP: Record<'equipment_installation' | 'equipment_replacement', string> = {
  equipment_installation:
    'Cargá el número de serie del equipo que se va a instalar. La tarea pasa a "En curso" y queda lista para finalizar.',
  equipment_replacement:
    'Cargá el número de serie del equipo nuevo que reemplaza al actual. La tarea pasa a "En curso" y queda lista para finalizar.',
};

/**
 * Step 1 of the two-step flow: operator loads the serial (and optional model)
 * for the new equipment. On success the ticket transitions to in_progress but
 * no physical side effects run yet — those fire at finalize time via
 * resolve_ticket. Hidden once the ticket is resolved/cancelled.
 */
export function ConfigureEquipmentPanel({ tarea }: ConfigureEquipmentPanelProps) {
  const category = tarea.category as 'equipment_installation' | 'equipment_replacement';
  const heading = CATEGORY_HEADINGS[category];
  const help = EMPTY_HELP[category];

  const configured = Boolean(tarea.pending_new_serial);
  const [editing, setEditing] = useState(false);
  const showForm = !configured || editing;

  const configure = useConfigureTechnicalTicketEquipment();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      serial: tarea.pending_new_serial ?? '',
      model: tarea.pending_new_model ?? '',
    },
  });

  useEffect(() => {
    if (showForm) {
      reset({
        serial: tarea.pending_new_serial ?? '',
        model: tarea.pending_new_model ?? '',
      });
    }
  }, [showForm, tarea.pending_new_serial, tarea.pending_new_model, reset]);

  const onSubmit = async (values: FormValues) => {
    await configure.mutateAsync({
      ticketId: tarea.id,
      newSerial: values.serial,
      newModel: values.model.length > 0 ? values.model : null,
    });
    setEditing(false);
  };

  const isPending = configure.isPending || isSubmitting;
  const modelPlaceholder = tarea.intended_product_name ?? 'Ej. Smart Lock Pro v2';

  return (
    <div className="flex flex-col gap-3 rounded-md border bg-card p-4">
      <SectionHeading title={heading} variant="secondary">
        {configured && !editing && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditing(true)}
            disabled={isPending}
          >
            Editar
          </Button>
        )}
      </SectionHeading>

      {!showForm && configured && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs uppercase text-muted-foreground">Serie</span>
            <span className="text-sm">{tarea.pending_new_serial}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs uppercase text-muted-foreground">Modelo</span>
            <span className="text-sm">
              {tarea.pending_new_model ?? tarea.intended_product_name ?? '—'}
            </span>
          </div>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          {!configured && (
            <p className="text-sm text-muted-foreground">{help}</p>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="pending_new_serial">Número de serie *</Label>
            <Input
              id="pending_new_serial"
              placeholder="Ej. SN-987654321"
              disabled={isPending}
              {...register('serial')}
            />
            {errors.serial && (
              <p className="text-sm text-destructive">{errors.serial.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="pending_new_model">
              Modelo <span className="text-muted-foreground">(opcional)</span>
            </Label>
            <Input
              id="pending_new_model"
              placeholder={modelPlaceholder}
              disabled={isPending}
              {...register('model')}
            />
            <p className="text-xs text-muted-foreground">
              Si lo dejás vacío se usa el modelo del producto pedido en la orden.
            </p>
          </div>

          <div className="flex justify-end gap-2">
            {configured && editing && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditing(false)}
                disabled={isPending}
              >
                Cancelar
              </Button>
            )}
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Guardando...' : 'Guardar equipo'}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
