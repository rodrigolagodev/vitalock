import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
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
import { useEquipment } from '@/hooks/useEquipment';
import { useProducts } from '@/hooks/useProducts';
import { useMutateTicketEquipment } from '@/hooks/useMutateTicketEquipment';
import { useResolveEquipmentInstallation } from '@/hooks/useResolveEquipmentInstallation';
import { useResolveEquipmentReplacement } from '@/hooks/useResolveEquipmentReplacement';
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

const ACCESS_TYPE_OPTIONS = [
  { value: 'principal', label: 'Principal' },
  { value: 'servicio', label: 'Servicio' },
  { value: 'cochera', label: 'Cochera' },
  { value: 'puerta_2', label: 'Puerta 2' },
  { value: 'puerta_3', label: 'Puerta 3' },
  { value: 'puerta_4', label: 'Puerta 4' },
  { value: 'otro', label: 'Otro' },
];

function modeForCategory(category: TareaRow['category']): Mode {
  switch (category) {
    case 'maintenance':
      return 'select';
    case 'installation':
    case 'equipment_installation':
      return 'create';
    case 'equipment_replacement':
      return 'replace';
    default:
      // Should not be invoked for key categories; fall back to select.
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
  const { data: equipment = [] } = useEquipment(buildingId);
  const { data: equipmentProducts = [] } = useProducts({ category: 'equipment' });
  const { assignExistingEquipment, createAndAssignEquipment } =
    useMutateTicketEquipment(buildingId);
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
      if (category === 'equipment_installation') {
        // equipment_installation: atomic RPC resolves ticket + emits stock movements.
        await resolveEquipmentInstallation.mutateAsync({
          ticketId,
          serial: values.serial_number.trim(),
          note: null,
        });
      } else {
        // installation has no product_id → generic resolve path (two-step flow unchanged).
        // The admin must call resolve_ticket separately after this step.
        await createAndAssignEquipment.mutateAsync({
          ticketId,
          buildingId,
          serial_number: values.serial_number.trim(),
          model: values.model.trim(),
          access_type: values.access_type,
          description: values.description?.trim() || null,
        });
      }
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
            <div className="flex flex-col gap-2">
              <Label htmlFor="assign-equipment-id">Equipo *</Label>
              <Controller
                control={selectForm.control}
                name="equipment_id"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="assign-equipment-id">
                      <SelectValue placeholder="Seleccioná un equipo" />
                    </SelectTrigger>
                    <SelectContent>
                      {equipment.map((eq) => (
                        <SelectItem key={eq.id} value={eq.id}>
                          {eq.serial_number}
                          {eq.model ? ` — ${eq.model}` : ''}
                          {eq.status !== 'active' ? ` (${eq.status})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {selectForm.formState.errors.equipment_id && (
                <p className="text-sm text-destructive">
                  {selectForm.formState.errors.equipment_id.message}
                </p>
              )}
              {equipment.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No hay equipos registrados en el edificio.
                </p>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={submitting}
              >
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
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-serial">Número de serie *</Label>
              <Input
                id="new-serial"
                placeholder="Ej. SN-987654321"
                {...createForm.register('serial_number')}
              />
              {createForm.formState.errors.serial_number && (
                <p className="text-sm text-destructive">
                  {createForm.formState.errors.serial_number.message}
                </p>
              )}
            </div>

            {category !== 'equipment_installation' && (
              <>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="new-model">Modelo *</Label>
                  <Controller
                    control={createForm.control}
                    name="model"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger id="new-model">
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
                  {createForm.formState.errors.model && (
                    <p className="text-sm text-destructive">
                      {createForm.formState.errors.model.message}
                    </p>
                  )}
                  {equipmentProducts.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      No hay productos categoría "equipo" en el stock. Cargá uno antes.
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor="new-access-type">Tipo de acceso *</Label>
                  <Controller
                    control={createForm.control}
                    name="access_type"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger id="new-access-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ACCESS_TYPE_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor="new-description">Descripción</Label>
                  <Input
                    id="new-description"
                    placeholder="Ubicación / detalle"
                    {...createForm.register('description')}
                  />
                </div>
              </>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={submitting}
              >
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
            <div className="flex flex-col gap-2">
              <Label htmlFor="old-equipment">Equipo actual *</Label>
              <Controller
                control={replaceForm.control}
                name="old_equipment_id"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="old-equipment">
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
              {replaceForm.formState.errors.old_equipment_id && (
                <p className="text-sm text-destructive">
                  {replaceForm.formState.errors.old_equipment_id.message}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="rep-serial">Nuevo número de serie *</Label>
              <Input
                id="rep-serial"
                placeholder="Ej. SN-NEW-001"
                {...replaceForm.register('new_serial_number')}
              />
              {replaceForm.formState.errors.new_serial_number && (
                <p className="text-sm text-destructive">
                  {replaceForm.formState.errors.new_serial_number.message}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="rep-model">Nuevo modelo *</Label>
              <Controller
                control={replaceForm.control}
                name="new_model"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="rep-model">
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
              {replaceForm.formState.errors.new_model && (
                <p className="text-sm text-destructive">
                  {replaceForm.formState.errors.new_model.message}
                </p>
              )}
              {equipmentProducts.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No hay productos categoría "equipo" en el stock. Cargá uno antes.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="rep-description">Descripción</Label>
              <Input
                id="rep-description"
                placeholder="Detalle del nuevo equipo"
                {...replaceForm.register('new_description')}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={submitting}
              >
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
