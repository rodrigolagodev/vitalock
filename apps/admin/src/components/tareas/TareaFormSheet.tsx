import { useEffect } from 'react';
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useMutateTarea } from '@/hooks/useMutateTarea';
import { useAdministrations } from '@/hooks/useAdministrations';
import { useBuildings } from '@/hooks/useBuildings';
import { useUnits } from '@/hooks/useUnits';
import { useEquipment } from '@/hooks/useEquipment';
import { useStaff } from '@/hooks/useStaff';
import { toastMutationError } from '@/hooks/mapMutationError';
import type { TareaRow } from '@/hooks/useTareas';

// ---- Zod schema ----

const schema = z
  .object({
    mode: z.enum(['create', 'edit']),
    administration_id: z.string().optional(),
    building_id: z.string().optional(),
    category: z.enum(['maintenance', 'installation']).optional(),
    description: z.string().min(1, 'La descripción es obligatoria'),
    unit_id: z.string().optional().nullable(),
    equipment_id: z.string().optional().nullable(),
    assigned_to_staff_id: z.string().optional().nullable(),
    status: z.string().optional(),
    resolution_notes: z.string().optional(),
    cancellation_reason: z.string().optional(),
    notes: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.mode === 'create') {
      if (!data.administration_id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Seleccioná una administración',
          path: ['administration_id'],
        });
      }
      if (!data.building_id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Seleccioná un edificio',
          path: ['building_id'],
        });
      }
      if (!data.category) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Seleccioná una categoría',
          path: ['category'],
        });
      }
    } else {
      if (
        data.status === 'resolved' &&
        (!data.resolution_notes || data.resolution_notes.trim() === '')
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'La nota de resolución es obligatoria',
          path: ['resolution_notes'],
        });
      }
      if (
        data.status === 'cancelled' &&
        (!data.cancellation_reason || data.cancellation_reason.trim() === '')
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'El motivo de cancelación es obligatorio',
          path: ['cancellation_reason'],
        });
      }
    }
  });

type FormValues = z.infer<typeof schema>;

// ---- Labels ----

const CATEGORY_LABELS: Record<TareaRow['category'], string> = {
  maintenance: 'Mantenimiento',
  installation: 'Instalación',
};

const STATUS_LABELS: Record<TareaRow['status'], string> = {
  open: 'Abierta',
  in_progress: 'En curso',
  resolved: 'Resuelta',
  cancelled: 'Cancelada',
};

const VALID_TRANSITIONS: Record<TareaRow['status'], TareaRow['status'][]> = {
  open: ['in_progress', 'cancelled'],
  in_progress: ['resolved', 'cancelled'],
  resolved: ['in_progress'],
  cancelled: [],
};

const NONE = 'none';

interface TareaFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tarea?: TareaRow | null;
}

export function TareaFormSheet({ open, onOpenChange, tarea }: TareaFormSheetProps) {
  const isEdit = Boolean(tarea);
  const { createTarea, updateTarea } = useMutateTarea();
  const { data: staff = [] } = useStaff();
  const { data: administrations = [] } = useAdministrations({ status: 'active' });

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: isEdit
      ? {
          mode: 'edit',
          description: '',
          assigned_to_staff_id: null,
          status: 'open',
          resolution_notes: '',
          cancellation_reason: '',
          notes: '',
        }
      : {
          mode: 'create',
          administration_id: '',
          building_id: '',
          category: 'maintenance',
          description: '',
          unit_id: null,
          equipment_id: null,
          assigned_to_staff_id: null,
          notes: '',
        },
  });

  const administrationId = watch('administration_id');
  const buildingId = watch('building_id');
  const selectedStatus = watch('status');

  // Buildings for building_id select — scoped to selected administration.
  const { data: buildings = [] } = useBuildings(
    administrationId ? { administrationId } : {},
  );

  // Units and equipment are only meaningful once a building is chosen.
  const { data: units = [] } = useUnits(buildingId ?? '');
  const { data: equipment = [] } = useEquipment(buildingId ?? '');

  useEffect(() => {
    if (!open) return;
    if (tarea) {
      reset({
        mode: 'edit',
        description: tarea.description,
        assigned_to_staff_id: tarea.assigned_to_staff_id,
        status: tarea.status,
        resolution_notes: tarea.resolution_notes ?? '',
        cancellation_reason: tarea.cancellation_reason ?? '',
        notes: tarea.notes ?? '',
      });
    } else {
      reset({
        mode: 'create',
        administration_id: '',
        building_id: '',
        category: 'maintenance',
        description: '',
        unit_id: null,
        equipment_id: null,
        assigned_to_staff_id: null,
        notes: '',
      });
    }
  }, [open, tarea, reset]);

  // When the building changes in create mode, clear unit/equipment so we never
  // send a unit/equipment that belongs to a different building.
  useEffect(() => {
    if (!isEdit && buildingId) {
      setValue('unit_id', null);
      setValue('equipment_id', null);
    }
  }, [isEdit, buildingId, setValue]);

  const currentStatus = tarea?.status ?? 'open';
  const statusOptions = isEdit
    ? [currentStatus, ...VALID_TRANSITIONS[currentStatus]]
    : [];

  const onSubmit = async (values: FormValues) => {
    try {
      if (values.mode === 'create') {
        await createTarea.mutateAsync({
          administration_id: values.administration_id ?? '',
          building_id: values.building_id ?? '',
          category: values.category ?? 'maintenance',
          description: values.description,
          unit_id: values.unit_id ?? null,
          equipment_id: values.equipment_id ?? null,
          assigned_to_staff_id: values.assigned_to_staff_id ?? null,
          notes: values.notes || null,
        });
      } else if (tarea) {
        const payload: {
          description: string;
          assigned_to_staff_id: string | null;
          notes: string | null;
          status?: string;
          resolution_notes?: string;
          cancellation_reason?: string;
        } = {
          description: values.description,
          assigned_to_staff_id: values.assigned_to_staff_id ?? null,
          notes: values.notes || null,
        };
        // Only send a status change; on reopen (resolved -> in_progress) the
        // DB trigger clears resolution_notes itself.
        if (values.status && values.status !== tarea.status) {
          payload.status = values.status;
          if (values.status === 'resolved') {
            payload.resolution_notes = values.resolution_notes ?? '';
          }
          if (values.status === 'cancelled') {
            payload.cancellation_reason = values.cancellation_reason ?? '';
          }
        }
        await updateTarea.mutateAsync({ id: tarea.id, ...payload });
      }
      onOpenChange(false);
    } catch (err) {
      toastMutationError(err as Error);
    }
  };

  const isPending = isEdit ? updateTarea.isPending : createTarea.isPending;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col gap-0 sm:max-w-lg overflow-y-auto">
        <SheetHeader className="p-6 pb-4">
          <SheetTitle>{isEdit ? 'Editar tarea' : 'Nueva tarea'}</SheetTitle>
        </SheetHeader>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-1 flex-col gap-6 px-6"
        >
          {isEdit && tarea && (
            <>
              {/* ---- Immutable context (read-only) ---- */}
              <div className="flex flex-col gap-2 rounded-md border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Tarea</span>
                  <span className="font-medium">{tarea.ticket_number}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Administración</span>
                  <span>{tarea.building?.administration?.company_name ?? '—'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Edificio</span>
                  <span>{tarea.building?.name ?? '—'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Categoría</span>
                  <span>{CATEGORY_LABELS[tarea.category]}</span>
                </div>
              </div>

              {/* ---- Status (valid transitions only) ---- */}
              <div className="flex flex-col gap-2">
                <Label htmlFor="status">Estado</Label>
                {statusOptions.length <= 1 ? (
                  <>
                    <div className="flex h-10 w-full items-center rounded-md border border-input bg-muted px-3 py-2 text-sm opacity-60">
                      {STATUS_LABELS[currentStatus]}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Cancelada (estado final)
                    </p>
                  </>
                ) : (
                  <>
                    <Controller
                      control={control}
                      name="status"
                      render={({ field }) => (
                        <Select
                          value={field.value ?? ''}
                          onValueChange={field.onChange}
                        >
                          <SelectTrigger id="status">
                            <SelectValue placeholder="Seleccioná un estado" />
                          </SelectTrigger>
                          <SelectContent>
                            {statusOptions.map((s) => (
                              <SelectItem key={s} value={s}>
                                {STATUS_LABELS[s]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    {errors.status && (
                      <p className="text-sm text-destructive">
                        {errors.status.message}
                      </p>
                    )}
                  </>
                )}
              </div>
            </>
          )}

          {/* ---- Administration (create only) ---- */}
          {!isEdit && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="administration_id">Administración *</Label>
              <Controller
                control={control}
                name="administration_id"
                render={({ field }) => (
                  <Select
                    value={field.value ?? ''}
                    onValueChange={(v) => field.onChange(v || '')}
                  >
                    <SelectTrigger id="administration_id">
                      <SelectValue placeholder="Seleccioná una administración" />
                    </SelectTrigger>
                    <SelectContent>
                      {administrations.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.company_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.administration_id && (
                <p className="text-sm text-destructive">
                  {errors.administration_id.message}
                </p>
              )}
            </div>
          )}

          {/* ---- Building (create only) ---- */}
          {!isEdit && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="building_id">Edificio *</Label>
              <Controller
                control={control}
                name="building_id"
                render={({ field }) => (
                  <Select
                    value={field.value ?? ''}
                    onValueChange={(v) => field.onChange(v || '')}
                    disabled={!administrationId}
                  >
                    <SelectTrigger id="building_id">
                      <SelectValue placeholder="Seleccioná un edificio" />
                    </SelectTrigger>
                    <SelectContent>
                      {buildings.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.building_id && (
                <p className="text-sm text-destructive">
                  {errors.building_id.message}
                </p>
              )}
            </div>
          )}

          {/* ---- Category (create only) ---- */}
          {!isEdit && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="category">Categoría *</Label>
              <Controller
                control={control}
                name="category"
                render={({ field }) => (
                  <Select value={field.value ?? 'maintenance'} onValueChange={field.onChange}>
                    <SelectTrigger id="category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(CATEGORY_LABELS).map(([val, label]) => (
                        <SelectItem key={val} value={val}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.category && (
                <p className="text-sm text-destructive">
                  {errors.category.message}
                </p>
              )}
            </div>
          )}

          {/* ---- Unit (create only) ---- */}
          {!isEdit && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="unit_id">Unidad</Label>
              <Controller
                control={control}
                name="unit_id"
                render={({ field }) => (
                  <Select
                    value={field.value ?? ''}
                    onValueChange={(v) => field.onChange(v === NONE ? null : v)}
                    disabled={!buildingId}
                  >
                    <SelectTrigger id="unit_id">
                      <SelectValue placeholder="Sin unidad" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Sin unidad</SelectItem>
                      {units.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.number}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          )}

          {/* ---- Equipment (create only) ---- */}
          {!isEdit && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="equipment_id">Equipo</Label>
              <Controller
                control={control}
                name="equipment_id"
                render={({ field }) => (
                  <Select
                    value={field.value ?? ''}
                    onValueChange={(v) => field.onChange(v === NONE ? null : v)}
                    disabled={!buildingId}
                  >
                    <SelectTrigger id="equipment_id">
                      <SelectValue placeholder="Sin equipo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Sin equipo</SelectItem>
                      {equipment.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.serial_number}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          )}

          {/* ---- Description ---- */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="description">Descripción *</Label>
            <Textarea
              id="description"
              rows={3}
              placeholder="Describí la tarea a realizar..."
              {...register('description')}
            />
            {errors.description && (
              <p className="text-sm text-destructive">
                {errors.description.message}
              </p>
            )}
          </div>

          {/* ---- Assigned staff ---- */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="assigned_to_staff_id">Asignada a</Label>
            <Controller
              control={control}
              name="assigned_to_staff_id"
              render={({ field }) => (
                <Select
                  value={field.value ?? ''}
                  onValueChange={(v) => field.onChange(v === NONE ? null : v)}
                >
                  <SelectTrigger id="assigned_to_staff_id">
                    <SelectValue placeholder="Sin asignar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Sin asignar</SelectItem>
                    {staff.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          {/* ---- Resolution notes (edit, only when resolving) ---- */}
          {isEdit && selectedStatus === 'resolved' && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="resolution_notes">Nota de resolución *</Label>
              <Textarea
                id="resolution_notes"
                rows={3}
                placeholder="Explicá cómo se resolvió..."
                {...register('resolution_notes')}
              />
              {errors.resolution_notes && (
                <p className="text-sm text-destructive">
                  {errors.resolution_notes.message}
                </p>
              )}
            </div>
          )}

          {/* ---- Cancellation reason (edit, only when cancelling) ---- */}
          {isEdit && selectedStatus === 'cancelled' && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="cancellation_reason">Motivo de cancelación *</Label>
              <Textarea
                id="cancellation_reason"
                rows={3}
                placeholder="Explicá por qué se cancela..."
                {...register('cancellation_reason')}
              />
              {errors.cancellation_reason && (
                <p className="text-sm text-destructive">
                  {errors.cancellation_reason.message}
                </p>
              )}
            </div>
          )}

          {/* ---- Notes ---- */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="notes">Notas</Label>
            <Textarea
              id="notes"
              rows={3}
              placeholder="Observaciones adicionales..."
              {...register('notes')}
            />
          </div>

          <SheetFooter className="mt-auto pt-4 pb-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending || isSubmitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending || isSubmitting}>
              {isPending || isSubmitting ? 'Guardando...' : 'Guardar'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
