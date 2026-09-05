import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@vitalock/ui';
import { Button } from '@vitalock/ui';
import { Input } from '@vitalock/ui';
import { Label } from '@vitalock/ui';
import { useMutateEquipment } from '@/hooks/useMutateEquipment';
import type { EquipmentRow } from '@/hooks/useEquipment';
import { EquipmentStatusSelect } from './EquipmentStatusSelect';
import type { EquipmentStatus } from '@/lib/status/equipmentStatus';
import { DecommissionDialog } from './DecommissionDialog';

// Create schema: model + serial_number + installed_at required
const createSchema = z.object({
  model: z.string().min(1, 'El modelo es obligatorio'),
  serial_number: z.string().min(1, 'El número de serie es obligatorio'),
  installed_at: z.string().min(1, 'La fecha de instalación es obligatoria'),
});

// Edit schema: only mutable fields
const editSchema = z.object({
  model: z.string().min(1, 'El modelo es obligatorio'),
});

type CreateFormValues = z.infer<typeof createSchema>;
type EditFormValues = z.infer<typeof editSchema>;

interface EquipmentFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buildingId: string;
  equipment?: EquipmentRow | null;
}

/**
 * Sheet for creating or editing equipment.
 *
 * CREATE mode: model + serial_number + installed_at editable; building_id hidden.
 * EDIT mode:
 *   - model editable
 *   - serial_number, building_id, installed_at, replaces_equipment_id: readonly display only
 *   - status editable via EquipmentStatusSelect (dead triggers DecommissionDialog)
 *   - dead status: all controls disabled
 */
export function EquipmentFormSheet({
  open,
  onOpenChange,
  buildingId,
  equipment,
}: EquipmentFormSheetProps) {
  const isEdit = Boolean(equipment);
  const isDead = equipment?.status === 'dead';

  const { createEquipment, updateEquipment, updateStatus } = useMutateEquipment(buildingId);

  const [currentStatus, setCurrentStatus] = useState<EquipmentStatus>(
    (equipment?.status as EquipmentStatus) ?? 'active',
  );
  const [decommissionOpen, setDecommissionOpen] = useState(false);

  // ---- CREATE form ----
  const createForm = useForm<CreateFormValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { model: '', serial_number: '', installed_at: '' },
  });

  // ---- EDIT form ----
  const editForm = useForm<EditFormValues>({
    resolver: zodResolver(editSchema),
    defaultValues: { model: '' },
  });

  useEffect(() => {
    if (open) {
      if (isEdit && equipment) {
        editForm.reset({ model: equipment.model ?? '' });
        setCurrentStatus((equipment.status as EquipmentStatus) ?? 'active');
      } else {
        createForm.reset({ model: '', serial_number: '', installed_at: '' });
        setCurrentStatus('active');
      }
    }
  }, [open, isEdit, equipment, createForm, editForm]);

  const onCreateSubmit = async (values: CreateFormValues) => {
    await createEquipment.mutateAsync({
      building_id: buildingId,
      model: values.model,
      serial_number: values.serial_number,
      installed_at: values.installed_at,
    });
    onOpenChange(false);
  };

  const onEditSubmit = async (values: EditFormValues) => {
    if (!equipment) return;
    const modelChanged = values.model !== (equipment.model ?? '');
    const statusChanged = currentStatus !== equipment.status && currentStatus !== 'dead';

    if (modelChanged) {
      await updateEquipment.mutateAsync({ id: equipment.id, model: values.model });
    }
    if (statusChanged) {
      await updateStatus.mutateAsync({ id: equipment.id, status: currentStatus });
    }
    onOpenChange(false);
  };

  const handleDeadSelected = () => {
    setDecommissionOpen(true);
  };

  const handleDecommissionConfirm = async (input: {
    id: string;
    status: 'active' | 'maintenance' | 'dead';
    decommission_reason: string;
  }) => {
    await updateStatus.mutateAsync(input);
    setDecommissionOpen(false);
    onOpenChange(false);
  };

  const handleDecommissionCancel = () => {
    setDecommissionOpen(false);
    // Revert selector to previous status
    setCurrentStatus((equipment?.status as EquipmentStatus) ?? 'active');
  };

  const isCreatePending = createEquipment.isPending;
  const isEditPending = updateEquipment.isPending || updateStatus.isPending;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="flex flex-col gap-0 sm:max-w-md">
          <SheetHeader className="p-6 pb-4">
            <SheetTitle>{isEdit ? 'Editar equipo' : 'Nuevo equipo'}</SheetTitle>
          </SheetHeader>

          {isEdit && equipment ? (
            // ---- EDIT form ----
            <form
              onSubmit={editForm.handleSubmit(onEditSubmit)}
              className="flex flex-1 flex-col gap-6 overflow-y-auto px-6"
            >
              {/* Mutable: model */}
              <div className="flex flex-col gap-2">
                <Label htmlFor="edit-model">Modelo</Label>
                <Input id="edit-model" disabled={isDead} {...editForm.register('model')} />
                {editForm.formState.errors.model && (
                  <p className="text-destructive text-sm">
                    {editForm.formState.errors.model.message}
                  </p>
                )}
              </div>

              {/* Status select */}
              <div className="flex flex-col gap-2">
                <Label>Estado</Label>
                <EquipmentStatusSelect
                  value={currentStatus}
                  onChange={setCurrentStatus}
                  onDeadSelected={handleDeadSelected}
                  disabled={isDead}
                />
              </div>

              {/* Immutable fields — read-only display */}
              <div className="flex flex-col gap-2">
                <Label>Número de serie</Label>
                <Input
                  value={equipment.serial_number}
                  readOnly
                  aria-readonly="true"
                  className="bg-muted text-muted-foreground cursor-default"
                  data-immutable="serial_number"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label>Fecha de instalación</Label>
                <Input
                  value={equipment.installed_at}
                  readOnly
                  aria-readonly="true"
                  className="bg-muted text-muted-foreground cursor-default"
                  data-immutable="installed_at"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label>ID de edificio</Label>
                <Input
                  value={equipment.building_id}
                  readOnly
                  aria-readonly="true"
                  className="bg-muted text-muted-foreground cursor-default"
                  data-immutable="building_id"
                />
              </div>

              <SheetFooter className="mt-auto pb-6 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={isEditPending || editForm.formState.isSubmitting}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={isDead || isEditPending || editForm.formState.isSubmitting}
                >
                  {isEditPending || editForm.formState.isSubmitting ? 'Guardando...' : 'Guardar'}
                </Button>
              </SheetFooter>
            </form>
          ) : (
            // ---- CREATE form ----
            <form
              onSubmit={createForm.handleSubmit(onCreateSubmit)}
              className="flex flex-1 flex-col gap-6 overflow-y-auto px-6"
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="create-model">Modelo *</Label>
                <Input
                  id="create-model"
                  placeholder="Ej. Smart Lock Pro"
                  {...createForm.register('model')}
                />
                {createForm.formState.errors.model && (
                  <p className="text-destructive text-sm">
                    {createForm.formState.errors.model.message}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="create-serial">Número de serie *</Label>
                <Input
                  id="create-serial"
                  placeholder="Ej. SN-123456789"
                  {...createForm.register('serial_number')}
                />
                {createForm.formState.errors.serial_number && (
                  <p className="text-destructive text-sm">
                    {createForm.formState.errors.serial_number.message}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="create-installed-at">Fecha de instalación *</Label>
                <Input
                  id="create-installed-at"
                  type="date"
                  {...createForm.register('installed_at')}
                />
                {createForm.formState.errors.installed_at && (
                  <p className="text-destructive text-sm">
                    {createForm.formState.errors.installed_at.message}
                  </p>
                )}
              </div>

              {/* building_id is intentionally hidden — passed as prop, never user-editable */}

              <SheetFooter className="mt-auto pb-6 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={isCreatePending || createForm.formState.isSubmitting}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={isCreatePending || createForm.formState.isSubmitting}
                >
                  {isCreatePending || createForm.formState.isSubmitting
                    ? 'Guardando...'
                    : 'Guardar'}
                </Button>
              </SheetFooter>
            </form>
          )}
        </SheetContent>
      </Sheet>

      {/* Decommission dialog — conditionally mounted when triggered */}
      {isEdit && equipment && (
        <DecommissionDialog
          open={decommissionOpen}
          onOpenChange={(open) => {
            if (!open) handleDecommissionCancel();
          }}
          equipmentId={equipment.id}
          onConfirm={handleDecommissionConfirm}
          isPending={updateStatus.isPending}
        />
      )}
    </>
  );
}
