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
import { AdministrationCombobox } from '@/components/administrations/AdministrationCombobox';
import { Badge } from '@vitalock/ui';
import { RadioGroup, RadioGroupItem } from '@vitalock/ui';
import { Button } from '@vitalock/ui';
import { Input } from '@vitalock/ui';
import { SectionHeading } from '@vitalock/ui';
import { Label } from '@vitalock/ui';
import { Textarea } from '@vitalock/ui';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@vitalock/ui';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@vitalock/ui';
import { Plus, Trash2 } from 'lucide-react';
import { useAdministrations } from '@/hooks/useAdministrations';
import { useBuildings } from '@/hooks/useBuildings';
import { usePersonal } from '@/hooks/usePersonal';
import { useEquipment } from '@/hooks/useEquipment';
import type { TechnicalOrderDetailRow } from '@/hooks/useTechnicalOrder';

// ---- Zod schema ----

const ITEM_TYPES = [
  'install_equipment',
  'replace_equipment',
  'maintain_equipment',
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
    // equipment is required for maintain_equipment and replace_equipment (spec §2.7)
    if (
      (item.item_type === 'maintain_equipment' || item.item_type === 'replace_equipment') &&
      !item.intended_equipment_id
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'El equipo es obligatorio para este tipo de trabajo',
        path: ['items', i, 'intended_equipment_id'],
      });
    }
    // product_id (from stock) is required for install_equipment and replace_equipment.
    // For install_equipment, this reserves the unit that will be
    // physically installed (the installer serializes it at resolve time).
    if (
      (item.item_type === 'install_equipment' ||
        item.item_type === 'replace_equipment') &&
      !item.product_id
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          item.item_type === 'replace_equipment'
            ? 'Elegí un equipo del stock para el reemplazo'
            : 'Elegí un equipo del stock',
        path: ['items', i, 'product_id'],
      });
    }
    // Price policy: maintain_equipment allows 0 (monthly plan covers it).
    // install/replace require unit_price > 0.
    if (
      item.item_type !== 'maintain_equipment' &&
      (item.unit_price == null || item.unit_price <= 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'El precio unitario es obligatorio y debe ser mayor a 0',
        path: ['items', i, 'unit_price'],
      });
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
  install_equipment: 'Instalación de equipo',
  replace_equipment: 'Reemplazo de equipo',
  maintain_equipment: 'Mantenimiento',
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
        className="flex flex-1 flex-col gap-8"
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
                <RadioGroup
                  value={field.value}
                  onValueChange={(v) =>
                    field.onChange(v as 'administration' | 'particular')
                  }
                  aria-label="Tipo de cliente"
                  className="grid w-full grid-cols-2"
                >
                  {(
                    [
                      { value: 'administration', label: 'Administración' },
                      { value: 'particular', label: 'Particular' },
                    ] as const
                  ).map((opt) => (
                    <RadioGroupItem
                      key={opt.value}
                      value={opt.value}
                      className="text-center"
                    >
                      {opt.label}
                    </RadioGroupItem>
                  ))}
                </RadioGroup>
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
                  <AdministrationCombobox
                    id="administration_id"
                    administrations={administrations}
                    value={field.value ?? null}
                    onChange={(v) => field.onChange(v || null)}
                    placeholder="Buscar por razón social o CUIT/CUIL"
                  />
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

        {/* ---- Section: Ítems (item cards inline, matching KeyOrderForm) ---- */}
        <section className="flex flex-col gap-4 rounded-md border p-5 bg-card">
          <div className="flex items-center justify-between border-b pb-2">
            <h2 className="text-base font-semibold">
              Ítems{' '}
              {fields.length > 0 && (
                <span className="text-muted-foreground font-normal">
                  ({fields.length})
                </span>
              )}
            </h2>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Agregar ítem
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-56 p-1">
                {ITEM_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => appendItem(type)}
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-sm hover:bg-accent text-left"
                  >
                    <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                    {ITEM_TYPE_LABELS[type]}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          </div>

          {errors.items && !Array.isArray(errors.items) && (
            <p className="text-sm text-destructive">{errors.items.message}</p>
          )}

          <div className="flex flex-col gap-3" data-testid="technical-order-items">
            {fields.map((field, index) => {
              const item = items[index];
              const buildingId = item?.building_id ?? null;
              const isOpen = openItemIndex === index;
              const itemTypeLabel = ITEM_TYPE_LABELS[item?.item_type ?? 'maintain_equipment'];
              const building = buildings.find((b) => b.id === buildingId);
              const itemErrors = errors.items?.[index];
              const price = Number(item?.unit_price) || 0;

              return (
                <div
                  key={field.id}
                  data-testid={`technical-order-item-${index}`}
                  className="flex flex-col rounded-md border bg-muted/20"
                >
                  {/* Header (always visible) */}
                  <div className="flex items-center gap-3 p-3">
                    <button
                      type="button"
                      onClick={() => setOpenItemIndex(isOpen ? null : index)}
                      aria-label={
                        isOpen
                          ? `Colapsar ítem ${index + 1}`
                          : `Expandir ítem ${index + 1}`
                      }
                      className="flex flex-1 min-w-0 items-center gap-3 text-left"
                    >
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {isOpen ? '▾' : '▸'}
                      </span>
                      <span className="flex-1 min-w-0 flex flex-wrap items-center gap-2">
                        <span className="font-medium text-sm shrink-0">
                          Ítem {index + 1}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200 truncate max-w-[200px]">
                          {itemTypeLabel}
                        </span>
                        {building && (
                          <>
                            <span className="text-xs text-muted-foreground">·</span>
                            <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                              {building.name}
                            </span>
                          </>
                        )}
                        {price > 0 && (
                          <>
                            <span className="text-xs text-muted-foreground">·</span>
                            <span className="text-xs font-medium tabular-nums">
                              ${price.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                            </span>
                          </>
                        )}
                      </span>
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 px-0 text-destructive hover:text-destructive"
                      aria-label={`Eliminar ítem ${index + 1}`}
                      onClick={() => {
                        remove(index);
                        if (openItemIndex === index) setOpenItemIndex(null);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Error summary visible when collapsed */}
                  {!isOpen && itemErrors && (
                    <div className="px-3 pb-3 flex flex-col gap-1">
                      {itemErrors.building_id && (
                        <p className="text-xs text-destructive">
                          {itemErrors.building_id.message}
                        </p>
                      )}
                      {itemErrors.intended_assignee_staff_id && (
                        <p className="text-xs text-destructive">
                          {itemErrors.intended_assignee_staff_id.message}
                        </p>
                      )}
                      {itemErrors.intended_equipment_id && (
                        <p className="text-xs text-destructive">
                          {itemErrors.intended_equipment_id.message}
                        </p>
                      )}
                      {itemErrors.product_id && (
                        <p className="text-xs text-destructive">
                          {itemErrors.product_id.message}
                        </p>
                      )}
                      {itemErrors.unit_price && (
                        <p className="text-xs text-destructive">
                          {itemErrors.unit_price.message}
                        </p>
                      )}
                    </div>
                  )}

                  {isOpen && (
                    <div className="flex flex-col gap-3 border-t px-4 pt-3 pb-4 bg-card">
                      {/* item_type — hidden, set when item is created via the "Agregar ítem" menu */}
                      <input type="hidden" {...register(`items.${index}.item_type`)} />

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

                      {/*
                        Quantity is always 1 per item — the DB CHECK enforces this.
                        Multiple installations = multiple items (no equipment can host
                        two simultaneous installations). Field stays as hidden input
                        so the value is submitted; the visible control was removed.
                      */}
                      <input
                        type="hidden"
                        {...register(`items.${index}.quantity`, { value: 1 })}
                      />
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

                    {/* Intended equipment — required for maintain_equipment/replace_equipment; optional for others */}
                    <TechnicalItemEquipmentField
                      index={index}
                      itemType={item?.item_type ?? 'maintain_equipment'}
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

                    {/* Unit price — required for install/replace; may be 0 for maintenance (monthly plan) */}
                    <div className="flex flex-col gap-1 sm:max-w-[200px]">
                      <Label htmlFor={`items.${index}.unit_price`}>
                        {item?.item_type === 'maintain_equipment'
                          ? 'Precio unitario (0 = plan mensual)'
                          : 'Precio unitario *'}
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

            {/* Ghost slot: dashed placeholder that hints "there's room for
                more". Visual only — the single entry point for adding items
                is the "Agregar ítem" button in the section header. */}
            <div
              data-testid="technical-order-item-ghost"
              className="rounded-md border-2 border-dashed border-border bg-muted/10 p-6 text-center text-sm text-muted-foreground"
            >
              {fields.length === 0
                ? 'La orden todavía no tiene ítems. Agregá el primero desde “Agregar ítem”.'
                : 'Hay lugar para más ítems.'}
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
        <div className="mt-auto sticky bottom-0 -mx-6 px-6 z-40 bg-background/95 backdrop-blur border-t p-4 flex items-center justify-end gap-3">
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
import { useProducts } from '@/hooks/useProducts';

interface TechnicalItemEquipmentFieldProps {
  index: number;
  itemType: TechnicalItemType;
  buildingId: string | null | undefined;
  control: Control<TechnicalOrderFormValues>;
  errors: FieldErrors<TechnicalOrderFormValues>;
}

function formatEquipmentLabel(model: string | null, serial: string): string {
  return model ? `${model} · ${serial}` : serial;
}

function TechnicalItemEquipmentField({
  index,
  itemType,
  buildingId,
  control,
  errors,
}: TechnicalItemEquipmentFieldProps) {
  const { data: equipment = [] } = useEquipment(buildingId ?? '', { activeOnly: true });
  // Stock catalog of equipment products — the "warehouse" pool used for
  // installations and replacements. The installer types the serial when
  // resolving the ticket; here we only reserve a unit of the product.
  const { data: stockProducts = [] } = useProducts({ category: 'equipment' });

  const isReplacement = itemType === 'replace_equipment';
  const isInstallationWork = itemType === 'install_equipment';
  const showTargetEquipment =
    itemType === 'maintain_equipment' || itemType === 'replace_equipment';
  const showStockProduct = isReplacement || isInstallationWork;

  const targetLabel = isReplacement
    ? 'Equipo actual (a reemplazar) *'
    : 'Equipo *';

  const stockLabel = isReplacement
    ? 'Equipo de reemplazo (del stock) *'
    : 'SKU del equipo a instalar (del stock) *';

  return (
    <div className="flex flex-col gap-3">
      {showTargetEquipment && (
        <div className="flex flex-col gap-1">
          <Label htmlFor={`items.${index}.intended_equipment_id`}>
            {targetLabel}
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
                  {equipment.length === 0 ? (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">
                      {buildingId
                        ? 'No hay equipos instalados en este edificio.'
                        : 'Primero elegí un edificio.'}
                    </div>
                  ) : (
                    equipment.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {formatEquipmentLabel(e.model, e.serial_number)}
                      </SelectItem>
                    ))
                  )}
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
      )}

      {showStockProduct && (
        <div className="flex flex-col gap-1">
          <Label htmlFor={`items.${index}.product_id`}>{stockLabel}</Label>
          <Controller
            control={control}
            name={`items.${index}.product_id`}
            render={({ field: f }) => (
              <Select
                value={f.value ?? ''}
                onValueChange={(v) => f.onChange(v || null)}
              >
                <SelectTrigger id={`items.${index}.product_id`}>
                  <SelectValue placeholder="Seleccioná un modelo del stock" />
                </SelectTrigger>
                <SelectContent>
                  {stockProducts.length === 0 ? (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">
                      No hay productos de tipo equipo cargados en el stock.
                    </div>
                  ) : (
                    stockProducts.map((p) => {
                      const outOfStock = p.stock_disponible <= 0;
                      return (
                        <SelectItem
                          key={p.id}
                          value={p.id}
                          disabled={outOfStock}
                        >
                          {p.name} · {p.stock_disponible} disp.
                        </SelectItem>
                      );
                    })
                  )}
                </SelectContent>
              </Select>
            )}
          />
          <p className="text-xs text-muted-foreground">
            {isInstallationWork
              ? 'El SKU reserva stock. El número de serie del equipo lo carga el instalador al resolver la tarea.'
              : 'El número de serie del equipo lo carga el instalador al resolver la tarea (o el admin desde el panel de tareas).'}
          </p>
          {errors.items?.[index]?.product_id && (
            <p className="text-xs text-destructive">
              {errors.items[index]?.product_id?.message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
