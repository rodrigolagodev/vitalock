import { useState } from 'react';
import {
  useForm,
  useFieldArray,
  Controller,
} from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ParticularSelector } from '@/components/particulares/ParticularSelector';
import { ParticularFormSheet } from '@/components/particulares/ParticularFormSheet';
import type { ParticularRow } from '@/hooks/useParticulares';
import { BuildingCombobox } from '@/components/buildings/BuildingCombobox';
import { Badge } from '@vitalock/ui';
import { Button } from '@vitalock/ui';
import { Input } from '@vitalock/ui';
import { SectionHeading } from '@vitalock/ui';
import { Label } from '@/components/ui/label';
import { Textarea } from '@vitalock/ui';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAdministrations } from '@/hooks/useAdministrations';
import { useBuildings } from '@/hooks/useBuildings';
import { usePersonal } from '@/hooks/usePersonal';
import { useEquipment } from '@/hooks/useEquipment';
import type { TechnicalOrderDetailRow } from '@/hooks/useTechnicalOrder';

// ---- Zod schema ----

const ITEM_TYPES = [
  'equipment',
  'maintenance',
  'installation',
  'equipment_replacement',
] as const;

type TechnicalItemType = (typeof ITEM_TYPES)[number];

const itemSchema = z.object({
  item_type: z.enum(ITEM_TYPES),
  quantity: z.coerce
    .number({ invalid_type_error: 'La cantidad debe ser un número' })
    .int()
    .min(1, 'Mínimo 1'),
  description: z.string().optional(),
  building_id: z.string().optional().nullable(),
  unit_price: z.coerce
    .number({ invalid_type_error: 'El precio debe ser un número' })
    .optional()
    .nullable(),
  product_id: z.string().optional().nullable(),
  intended_equipment_id: z.string().optional().nullable(),
  intended_replacement_equipment_id: z.string().optional().nullable(),
  intended_assignee_staff_id: z.string().optional().nullable(),
});

const baseSchema = z.object({
  client_type: z.enum(['administration', 'particular']),
  administration_id: z.string().optional().nullable(),
  particular_id: z.string().optional().nullable(),
  particular_full_name: z.string().optional(),
  particular_dni: z.string().optional(),
  particular_phone: z.string().optional(),
  particular_email: z.string().email('Email inválido').optional().or(z.literal('')),
  notes: z.string().optional(),
  items: z.array(itemSchema).min(1, 'Agregá al menos un ítem'),
});

// confirmImmediately is always true in current UI — validation mirrors spec §2.7
const schema = baseSchema.superRefine((data, ctx) => {
  if (data.client_type === 'administration' && !data.administration_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Seleccioná una administración',
      path: ['administration_id'],
    });
  }
  if (data.client_type === 'particular' && !data.particular_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Seleccioná un particular',
      path: ['particular_id'],
    });
  }
  data.items.forEach((item, i) => {
    // building_id is always required (NOT NULL in DB)
    if (!item.building_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'El edificio es obligatorio para cada línea de trabajo',
        path: ['items', i, 'building_id'],
      });
    }
    // assignee is always required at confirm time (for all item types)
    if (!item.intended_assignee_staff_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'El responsable es obligatorio al confirmar la orden',
        path: ['items', i, 'intended_assignee_staff_id'],
      });
    }
    // equipment is required for maintenance and equipment_replacement (spec §2.7)
    if (
      (item.item_type === 'maintenance' || item.item_type === 'equipment_replacement') &&
      !item.intended_equipment_id
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'El equipo es obligatorio para este tipo de trabajo',
        path: ['items', i, 'intended_equipment_id'],
      });
    }
    // replacement equipment is required for equipment_replacement, and must differ from the target
    if (item.item_type === 'equipment_replacement') {
      if (!item.intended_replacement_equipment_id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'El equipo de reemplazo es obligatorio para este tipo de trabajo',
          path: ['items', i, 'intended_replacement_equipment_id'],
        });
      } else if (
        item.intended_equipment_id &&
        item.intended_replacement_equipment_id === item.intended_equipment_id
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'El equipo de reemplazo no puede ser el mismo que el actual',
          path: ['items', i, 'intended_replacement_equipment_id'],
        });
      }
    }
  });
});

export type TechnicalOrderFormValues = z.infer<typeof schema>;

// ---- Empty defaults ----

const EMPTY_DEFAULTS: TechnicalOrderFormValues = {
  client_type: 'administration',
  administration_id: null,
  particular_id: null,
  particular_full_name: '',
  particular_dni: '',
  particular_phone: '',
  particular_email: '',
  notes: '',
  items: [],
};

// ---- Props ----

export interface TechnicalOrderFormProps {
  mode: 'create' | 'edit';
  /** Provide pre-filled values directly (useful in tests). */
  initialValues?: TechnicalOrderFormValues;
  /** Required when mode='edit'. Provides the existing order data for defaults and concurrency token. */
  initialOrder?: TechnicalOrderDetailRow;
  onSubmit: (values: TechnicalOrderFormValues) => Promise<void>;
  onCancel?: () => void;
  isPending?: boolean;
}

function buildInitialValues(order: TechnicalOrderDetailRow): TechnicalOrderFormValues {
  return {
    client_type: order.client_type,
    administration_id: order.administration_id ?? null,
    particular_id: order.particular_id ?? null,
    particular_full_name: order.particular_full_name ?? '',
    particular_dni: order.particular_dni ?? '',
    particular_phone: order.particular_phone ?? '',
    particular_email: order.particular_email ?? '',
    notes: order.notes ?? '',
    items: order.technical_order_items.map((item) => ({
      item_type: item.item_type,
      quantity: item.quantity,
      description: item.description ?? '',
      building_id: item.building_id ?? null,
      unit_price: item.unit_price ?? null,
      product_id: item.product_id ?? null,
      intended_equipment_id: item.intended_equipment_id ?? null,
      intended_replacement_equipment_id: item.intended_replacement_equipment_id ?? null,
      intended_assignee_staff_id: item.intended_assignee_staff_id ?? null,
    })),
  };
}

// ---- Item type labels ----

const ITEM_TYPE_LABELS: Record<TechnicalItemType, string> = {
  equipment: 'Trabajo general',
  maintenance: 'Mantenimiento',
  installation: 'Instalación',
  equipment_replacement: 'Reemplazo de equipo',
};

export function TechnicalOrderForm({
  mode,
  initialValues,
  initialOrder,
  onSubmit,
  onCancel,
  isPending = false,
}: TechnicalOrderFormProps) {
  const defaultValues = initialValues ?? (initialOrder ? buildInitialValues(initialOrder) : EMPTY_DEFAULTS);

  const { data: administrations = [] } = useAdministrations({ status: 'active' });

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<TechnicalOrderFormValues>({
    resolver: zodResolver(schema),
    defaultValues,
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  const [particular, setParticular] = useState<ParticularRow | null>(null);
  const [editParticularOpen, setEditParticularOpen] = useState(false);
  const [openItemIndex, setOpenItemIndex] = useState<number | null>(null);

  const clientType = watch('client_type');
  const administrationId = watch('administration_id');
  const items = watch('items');

  const { data: buildings = [] } = useBuildings(
    clientType === 'administration' && administrationId
      ? { administrationId }
      : {},
  );

  const { data: staffList = [] } = usePersonal();

  const handleParticularChange = (p: ParticularRow | null) => {
    setParticular(p);
    setValue('particular_id', p?.id ?? null);
    setValue('particular_full_name', p?.full_name ?? '');
    setValue('particular_dni', p?.dni ?? '');
    setValue('particular_phone', p?.phone ?? '');
    setValue('particular_email', p?.email ?? '');
  };

  const handleParticularSaved = (p: ParticularRow) => {
    if (particular && p.id === particular.id) {
      handleParticularChange(p);
    }
  };

  const handleCancel = () => {
    if (isDirty && !window.confirm('Vas a perder los cambios. ¿Salir igual?')) {
      return;
    }
    onCancel?.();
  };

  const appendItem = (itemType: TechnicalItemType) => {
    append({
      item_type: itemType,
      quantity: 1,
      description: '',
      building_id: null,
      unit_price: null,
      product_id: null,
      intended_equipment_id: null,
      intended_replacement_equipment_id: null,
      intended_assignee_staff_id: null,
    });
    setOpenItemIndex(fields.length);
  };

  const isFormPending = isPending || isSubmitting;
  const submitLabel = mode === 'edit' ? 'Guardar cambios' : 'Crear y confirmar orden';

  return (
    <>
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="flex flex-col gap-8"
        id="technical-order-form"
      >
        {/* ---- Section: Cliente ---- */}
        <section className="flex flex-col gap-4 rounded-md border p-5 bg-card">
          <SectionHeading title="Cliente" />

          <div className="flex flex-col gap-2">
            <Label>Tipo de cliente *</Label>
            <Controller
              control={control}
              name="client_type"
              render={({ field }) => (
                <div className="flex flex-wrap items-center gap-2">
                  {(
                    [
                      { value: 'administration', label: 'Administración' },
                      { value: 'particular', label: 'Particular' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => field.onChange(opt.value)}
                    >
                      <Badge
                        variant={field.value === opt.value ? 'default' : 'secondary'}
                        className="cursor-pointer"
                      >
                        {opt.label}
                      </Badge>
                    </button>
                  ))}
                </div>
              )}
            />
          </div>

          {clientType === 'administration' && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="administration_id">Administración *</Label>
              <Controller
                control={control}
                name="administration_id"
                render={({ field }) => (
                  <Select
                    value={field.value ?? ''}
                    onValueChange={(v) => field.onChange(v || null)}
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

          {clientType === 'particular' && (
            <div className="flex flex-col gap-2">
              <Label>Particular *</Label>
              <ParticularSelector
                value={particular}
                onChange={handleParticularChange}
                onEdit={() => setEditParticularOpen(true)}
              />
              {errors.particular_id && (
                <p className="text-sm text-destructive">
                  {errors.particular_id.message}
                </p>
              )}
            </div>
          )}
        </section>

        {/* ---- Section: Líneas de trabajo ---- */}
        <section className="flex flex-col gap-4 rounded-md border p-5 bg-card">
          <SectionHeading
            title="Líneas de trabajo"
            description="Cada línea es un ítem de servicio técnico."
          />

          {errors.items && !Array.isArray(errors.items) && (
            <p className="text-sm text-destructive">{errors.items.message}</p>
          )}

          {fields.map((field, index) => {
            const item = items[index];
            const buildingId = item?.building_id ?? null;
            const isOpen = openItemIndex === index;
            const itemTypeLabel = ITEM_TYPE_LABELS[item?.item_type ?? 'equipment'];

            return (
              <div
                key={field.id}
                className="flex flex-col gap-3 rounded-md border bg-muted/20"
              >
                {/* Collapsible header */}
                <div className="flex items-center justify-between gap-2 p-3">
                  <button
                    type="button"
                    onClick={() => setOpenItemIndex(isOpen ? null : index)}
                    className="flex flex-1 items-center gap-3 text-left"
                  >
                    <span className="text-xs text-muted-foreground">
                      {isOpen ? '▾' : '▸'}
                    </span>
                    <span className="text-xs font-medium text-muted-foreground shrink-0">
                      Línea {index + 1}
                    </span>
                    {!isOpen && (
                      <span className="truncate text-sm text-foreground">
                        {itemTypeLabel}
                      </span>
                    )}
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      remove(index);
                      if (openItemIndex === index) setOpenItemIndex(null);
                    }}
                    className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                    aria-label={`Eliminar línea ${index + 1}`}
                  >
                    Eliminar
                  </Button>
                </div>

                {/* Item-level error summary — always visible even when collapsed */}
                {!isOpen && (
                  <>
                    {errors.items?.[index]?.building_id && (
                      <p className="px-3 pb-2 text-xs text-destructive">
                        {errors.items[index]?.building_id?.message}
                      </p>
                    )}
                    {errors.items?.[index]?.intended_assignee_staff_id && (
                      <p className="px-3 pb-2 text-xs text-destructive">
                        {errors.items[index]?.intended_assignee_staff_id?.message}
                      </p>
                    )}
                    {errors.items?.[index]?.intended_equipment_id && (
                      <p className="px-3 pb-2 text-xs text-destructive">
                        {errors.items[index]?.intended_equipment_id?.message}
                      </p>
                    )}
                  </>
                )}

                {isOpen && (
                  <div className="flex flex-col gap-3 border-t px-4 pt-3 pb-4">
                    {/* item_type — hidden, set when item is created via chip picker */}
                    <input type="hidden" {...register(`items.${index}.item_type`)} />

                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{itemTypeLabel}</Badge>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="flex flex-col gap-1">
                        <Label htmlFor={`items.${index}.building_id`}>
                          Edificio *
                        </Label>
                        <Controller
                          control={control}
                          name={`items.${index}.building_id`}
                          render={({ field: f }) => (
                            <BuildingCombobox
                              id={`items.${index}.building_id`}
                              buildings={buildings}
                              value={f.value}
                              onChange={(v) => f.onChange(v)}
                              placeholder="Buscar por nombre o dirección"
                            />
                          )}
                        />
                        {errors.items?.[index]?.building_id && (
                          <p className="text-xs text-destructive">
                            {errors.items[index]?.building_id?.message}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-col gap-1 sm:max-w-[200px]">
                        <Label htmlFor={`items.${index}.quantity`}>Cantidad</Label>
                        <Input
                          id={`items.${index}.quantity`}
                          type="number"
                          min={1}
                          {...register(`items.${index}.quantity`)}
                        />
                        {errors.items?.[index]?.quantity && (
                          <p className="text-xs text-destructive">
                            {errors.items[index]?.quantity?.message}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Intended assignee — required for all types at confirm time */}
                    <div className="flex flex-col gap-1">
                      <Label htmlFor={`items.${index}.intended_assignee_staff_id`}>
                        Responsable *
                      </Label>
                      <Controller
                        control={control}
                        name={`items.${index}.intended_assignee_staff_id`}
                        render={({ field: f }) => (
                          <Select
                            value={f.value ?? ''}
                            onValueChange={(v) => f.onChange(v || null)}
                          >
                            <SelectTrigger id={`items.${index}.intended_assignee_staff_id`}>
                              <SelectValue placeholder="Seleccioná un responsable" />
                            </SelectTrigger>
                            <SelectContent>
                              {staffList.map((s) => (
                                <SelectItem key={s.id} value={s.id}>
                                  {s.full_name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                      {errors.items?.[index]?.intended_assignee_staff_id && (
                        <p className="text-xs text-destructive">
                          {errors.items[index]?.intended_assignee_staff_id?.message}
                        </p>
                      )}
                    </div>

                    {/* Intended equipment — required for maintenance/equipment_replacement; optional for others */}
                    <TechnicalItemEquipmentField
                      index={index}
                      itemType={item?.item_type ?? 'equipment'}
                      buildingId={buildingId}
                      control={control}
                      errors={errors}
                    />

                    {/* Description */}
                    <div className="flex flex-col gap-1">
                      <Label htmlFor={`items.${index}.description`}>
                        Descripción (opcional)
                      </Label>
                      <Input
                        id={`items.${index}.description`}
                        placeholder="Detalle del trabajo..."
                        {...register(`items.${index}.description`)}
                      />
                    </div>

                    {/* Unit price — optional per spec */}
                    <div className="flex flex-col gap-1 sm:max-w-[200px]">
                      <Label htmlFor={`items.${index}.unit_price`}>
                        Precio unitario (opcional)
                      </Label>
                      <Input
                        id={`items.${index}.unit_price`}
                        type="number"
                        min={0}
                        step="0.01"
                        placeholder="0.00"
                        {...register(`items.${index}.unit_price`)}
                      />
                      {errors.items?.[index]?.unit_price && (
                        <p className="text-xs text-destructive">
                          {errors.items[index]?.unit_price?.message}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Item type chip picker */}
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">Agregar línea de trabajo:</p>
            <div className="flex flex-wrap gap-2">
              {ITEM_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => appendItem(type)}
                >
                  <Badge variant="secondary" className="cursor-pointer">
                    + {ITEM_TYPE_LABELS[type]}
                  </Badge>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* ---- Section: Notas ---- */}
        <section className="flex flex-col gap-4 rounded-md border p-5 bg-card">
          <SectionHeading title="Notas" />
          <Textarea
            id="notes"
            placeholder="Observaciones adicionales..."
            {...register('notes')}
          />
        </section>

        {/* ---- Sticky action bar ---- */}
        <div className="sticky bottom-0 bg-background/95 backdrop-blur border-t p-4 flex items-center justify-end gap-3">
          {onCancel && (
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              disabled={isFormPending}
            >
              Cancelar
            </Button>
          )}
          <Button type="submit" disabled={isFormPending}>
            {isFormPending ? 'Guardando...' : submitLabel}
          </Button>
        </div>
      </form>

      {/* Particular edit sheet — outside form to avoid nesting issue */}
      <ParticularFormSheet
        open={editParticularOpen}
        onOpenChange={setEditParticularOpen}
        particular={particular}
        onSaved={handleParticularSaved}
      />
    </>
  );
}

// ---- TechnicalItemEquipmentField sub-component ----

import type { Control, FieldErrors } from 'react-hook-form';

interface TechnicalItemEquipmentFieldProps {
  index: number;
  itemType: TechnicalItemType;
  buildingId: string | null | undefined;
  control: Control<TechnicalOrderFormValues>;
  errors: FieldErrors<TechnicalOrderFormValues>;
}

function TechnicalItemEquipmentField({
  index,
  itemType,
  buildingId,
  control,
  errors,
}: TechnicalItemEquipmentFieldProps) {
  const { data: equipment = [] } = useEquipment(buildingId ?? '');

  const isReplacement = itemType === 'equipment_replacement';
  const isRequired = itemType === 'maintenance' || isReplacement;

  // installation and equipment types don't need equipment picker
  if (itemType === 'equipment') {
    return null;
  }

  const primaryLabel = isReplacement
    ? 'Equipo actual (a reemplazar) *'
    : isRequired
      ? 'Equipo *'
      : 'Equipo a instalar (opcional)';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor={`items.${index}.intended_equipment_id`}>
          {primaryLabel}
        </Label>
        <Controller
          control={control}
          name={`items.${index}.intended_equipment_id`}
          render={({ field: f }) => (
            <Select
              value={f.value ?? ''}
              onValueChange={(v) => f.onChange(v || null)}
              disabled={!buildingId}
            >
              <SelectTrigger id={`items.${index}.intended_equipment_id`}>
                <SelectValue
                  placeholder={
                    buildingId
                      ? 'Seleccioná un equipo'
                      : 'Primero elegí un edificio'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {equipment.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.model ?? e.serial_number}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {errors.items?.[index]?.intended_equipment_id && (
          <p className="text-xs text-destructive">
            {errors.items[index]?.intended_equipment_id?.message}
          </p>
        )}
      </div>

      {isReplacement && (
        <div className="flex flex-col gap-1">
          <Label htmlFor={`items.${index}.intended_replacement_equipment_id`}>
            Equipo de reemplazo (nuevo, desde depósito) *
          </Label>
          <Controller
            control={control}
            name={`items.${index}.intended_replacement_equipment_id`}
            render={({ field: f }) => (
              <Select
                value={f.value ?? ''}
                onValueChange={(v) => f.onChange(v || null)}
                disabled={!buildingId}
              >
                <SelectTrigger id={`items.${index}.intended_replacement_equipment_id`}>
                  <SelectValue
                    placeholder={
                      buildingId
                        ? 'Seleccioná el equipo nuevo'
                        : 'Primero elegí un edificio'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {equipment.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.model ?? e.serial_number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.items?.[index]?.intended_replacement_equipment_id && (
            <p className="text-xs text-destructive">
              {errors.items[index]?.intended_replacement_equipment_id?.message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
