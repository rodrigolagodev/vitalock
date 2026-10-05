import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  FormField,
} from '@vitalock/ui';
import { useEquipment } from '@/hooks/useEquipment';
import { useProducts } from '@/hooks/useProducts';
import { useMutateTicketEquipment } from '@/hooks/useMutateTicketEquipment';
import { useResolveEquipmentInstallation } from '@/hooks/useResolveEquipmentInstallation';
import { useResolveEquipmentReplacement } from '@/hooks/useResolveEquipmentReplacement';
import { equipmentStatus } from '@/lib/status/equipmentStatus';
import type { TareaRow } from '@/hooks/useTareas';

type Mode = 'select' | 'create' | 'replace';

interface AssignEquipmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticketId: string;
  buildingId: string;
  /** Determines the dialog UX. */
  category: TareaRow['category'];
}

const selectSchema = z.object({
  equipment_id: z.string().min(1, 'Seleccioná un equipo'),
});
type SelectValues = z.infer<typeof selectSchema>;

const createSchema = z.object({
  serial_number: z.string().min(1, 'El número de serie es obligatorio'),
  model: z.string().min(1, 'El modelo es obligatorio'),
  access_type: z.string().min(1, 'El tipo de acceso es obligatorio'),
  description: z.string().optional(),
});
type CreateValues = z.infer<typeof createSchema>;

const replaceSchema = z.object({
  old_equipment_id: z.string().min(1, 'Seleccioná el equipo a reemplazar'),
  new_serial_number: z.string().min(1, 'El número de serie es obligatorio'),
  new_model: z.string().min(1, 'El modelo es obligatorio'),
  new_description: z.string().optional(),
});
type ReplaceValues = z.infer<typeof replaceSchema>;

function modeForCategory(category: TareaRow['category']): Mode {
  switch (category) {
    case 'maintain_equipment':
      return 'select';
    case 'install_equipment':
      return 'create';
    case 'replace_equipment':
      return 'replace';
    default:
      return 'select';
  }
}

export function AssignEquipmentDialog({
  open,
  onOpenChange,
  ticketId,
  buildingId,
  category,
}: AssignEquipmentDialogProps) {
  const mode = modeForCategory(category);
  const { data: equipment = [] } = useEquipment(buildingId, { activeOnly: true });
  const { data: equipmentProducts = [] } = useProducts({ category: 'equipment' });
  const { assignExistingEquipment } = useMutateTicketEquipment(buildingId);
  const resolveEquipmentInstallation = useResolveEquipmentInstallation(buildingId);
  const resolveEquipmentReplacement = useResolveEquipmentReplacement(buildingId);

  const [submitting, setSubmitting] = useState(false);

  // Distinct forms per mode — keep them isolated to avoid schema cross-talk.
  const selectForm = useForm<SelectValues>({
    resolver: zodResolver(selectSchema),
    defaultValues: { equipment_id: '' },
  });
  const createForm = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      serial_number: '',
      model: '',
      access_type: 'principal',
      description: '',
    },
  });
  const replaceForm = useForm<ReplaceValues>({
    resolver: zodResolver(replaceSchema),
    defaultValues: {
      old_equipment_id: '',
      new_serial_number: '',
      new_model: '',
      new_description: '',
    },
  });

  useEffect(() => {
    if (open) {
      selectForm.reset();
      createForm.reset();
      replaceForm.reset();
    }
  }, [open, selectForm, createForm, replaceForm]);

  const handleClose = () => {
    onOpenChange(false);
  };

  const onSelectSubmit = async (values: SelectValues) => {
    setSubmitting(true);
    try {
      await assignExistingEquipment.mutateAsync({
        ticketId,
        equipmentId: values.equipment_id,
      });
      handleClose();
    } finally {
      setSubmitting(false);
    }
  };

  const onCreateSubmit = async (values: CreateValues) => {
    setSubmitting(true);
    try {
      // install_equipment: atomic RPC resolves ticket + emits stock movements.
      await resolveEquipmentInstallation.mutateAsync({
        ticketId,
        serial: values.serial_number.trim(),
        note: null,
      });
      handleClose();
    } finally {
      setSubmitting(false);
    }
  };

  const onReplaceSubmit = async (values: ReplaceValues) => {
    setSubmitting(true);
    try {
      // equipment_replacement: atomic RPC resolves ticket + emits stock movements.
      await resolveEquipmentReplacement.mutateAsync({
        ticketId,
        oldEquipmentId: values.old_equipment_id,
        newSerial: values.new_serial_number.trim(),
        newModel: values.new_model.trim(),
        newDescription: values.new_description?.trim() || null,
        note: null,
      });
      handleClose();
    } finally {
      setSubmitting(false);
    }
  };

  const title =
    mode === 'select'
      ? 'Asignar equipo existente'
      : mode === 'create'
        ? 'Registrar equipo nuevo'
        : 'Reemplazar equipo';

  const description =
    mode === 'select'
      ? 'Elegí uno de los equipos ya instalados en el edificio.'
      : mode === 'create'
        ? 'Se creará el registro del equipo y quedará asignado a la tarea.'
        : 'El equipo actual pasa a "dado de baja" y las autorizaciones se migran al nuevo.';

  const activeEquipment = equipment.filter((e) => e.status === 'active');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {mode === 'select' && (
          <form
            onSubmit={(e) => {
              e.stopPropagation();
              void selectForm.handleSubmit(onSelectSubmit)(e);
            }}
            className="flex flex-col gap-4"
          >
            <FormField
              label="Equipo *"
              id="assign-equipment-id"
              error={selectForm.formState.errors.equipment_id?.message}
              description={
                equipment.length === 0 ? 'No hay equipos registrados en el edificio.' : undefined
              }
            >
              {(a11y) => (
                <Controller
                  control={selectForm.control}
                  name="equipment_id"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger {...a11y}>
                        <SelectValue placeholder="Seleccioná un equipo" />
                      </SelectTrigger>
                      <SelectContent>
                        {equipment.map((eq) => (
                          <SelectItem key={eq.id} value={eq.id}>
                            {eq.serial_number}
                            {eq.model ? ` — ${eq.model}` : ''}
                            {eq.status !== 'active' ? ` (${equipmentStatus.label(eq.status)})` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              )}
            </FormField>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose} disabled={submitting}>
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting || equipment.length === 0}>
                {submitting ? 'Asignando...' : 'Asignar'}
              </Button>
            </DialogFooter>
          </form>
        )}

        {mode === 'create' && (
          <form
            onSubmit={(e) => {
              e.stopPropagation();
              void createForm.handleSubmit(onCreateSubmit)(e);
            }}
            className="flex flex-col gap-4"
          >
            <FormField
              label="Número de serie *"
              id="new-serial"
              error={createForm.formState.errors.serial_number?.message}
            >
              <Input placeholder="Ej. SN-987654321" {...createForm.register('serial_number')} />
            </FormField>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose} disabled={submitting}>
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Guardando...' : 'Crear y asignar'}
              </Button>
            </DialogFooter>
          </form>
        )}

        {mode === 'replace' && (
          <form
            onSubmit={(e) => {
              e.stopPropagation();
              void replaceForm.handleSubmit(onReplaceSubmit)(e);
            }}
            className="flex flex-col gap-4"
          >
            <FormField
              label="Equipo actual *"
              id="old-equipment"
              error={replaceForm.formState.errors.old_equipment_id?.message}
            >
              {(a11y) => (
                <Controller
                  control={replaceForm.control}
                  name="old_equipment_id"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger {...a11y}>
                        <SelectValue placeholder="Seleccioná el equipo a reemplazar" />
                      </SelectTrigger>
                      <SelectContent>
                        {activeEquipment.map((eq) => (
                          <SelectItem key={eq.id} value={eq.id}>
                            {eq.serial_number}
                            {eq.model ? ` — ${eq.model}` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              )}
            </FormField>

            <FormField
              label="Nuevo número de serie *"
              id="rep-serial"
              error={replaceForm.formState.errors.new_serial_number?.message}
            >
              <Input placeholder="Ej. SN-NEW-001" {...replaceForm.register('new_serial_number')} />
            </FormField>

            <FormField
              label="Nuevo modelo *"
              id="rep-model"
              error={replaceForm.formState.errors.new_model?.message}
              description={
                equipmentProducts.length === 0
                  ? 'No hay productos categoría "equipo" en el stock. Cargá uno antes.'
                  : undefined
              }
            >
              {(a11y) => (
                <Controller
                  control={replaceForm.control}
                  name="new_model"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger {...a11y}>
                        <SelectValue placeholder="Seleccioná un modelo (stock)" />
                      </SelectTrigger>
                      <SelectContent>
                        {equipmentProducts.map((p) => (
                          <SelectItem key={p.id} value={p.name}>
                            {p.name} — disponible: {p.stock_disponible}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              )}
            </FormField>

            <div className="flex flex-col gap-2">
              <Label htmlFor="rep-description">Descripción</Label>
              <Input
                id="rep-description"
                placeholder="Detalle del nuevo equipo"
                {...replaceForm.register('new_description')}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose} disabled={submitting}>
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting || activeEquipment.length === 0}>
                {submitting ? 'Procesando...' : 'Reemplazar'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
