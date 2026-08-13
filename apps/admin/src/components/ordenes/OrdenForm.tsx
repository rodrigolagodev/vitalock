import { useState } from 'react';
import {
  useForm,
  useFieldArray,
  Controller,
  type Control,
  type UseFormRegister,
  type UseFormSetValue,
  type FieldErrors,
} from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ParticularSelector } from '@/components/particulares/ParticularSelector';
import { ParticularFormSheet } from '@/components/particulares/ParticularFormSheet';
import type { ParticularRow } from '@/hooks/useParticulares';
import { BuildingCombobox } from '@/components/buildings/BuildingCombobox';
import { QuickUnitCreateDialog } from '@/components/ordenes/QuickUnitCreateDialog';
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
import { useUnits } from '@/hooks/useUnits';
import { useProducts } from '@/hooks/useProducts';

// ---- Zod schema ----

const itemSchema = z.object({
  item_type: z.enum(
    ['key', 'equipment', 'maintenance', 'installation', 'equipment_replacement'],
    { required_error: 'El tipo es obligatorio' },
  ),
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
  unit_id: z.string().optional().nullable(),
  pickup_particular_id: z.string().optional().nullable(),
  pickup_same_as_particular: z.boolean().optional(),
  product_id: z.string().optional().nullable(),
});

const baseSchema = z.object({
  order_type: z.enum(['keys', 'technical']),
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

const KEYS_TYPES = new Set(['key']);
const TECHNICAL_TYPES = new Set([
  'equipment',
  'maintenance',
  'installation',
  'equipment_replacement',
]);

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
    if (data.order_type === 'keys' && !KEYS_TYPES.has(item.item_type)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'En órdenes de llaves solo se admiten ítems de tipo llave',
        path: ['items', i, 'item_type'],
      });
    }
    if (data.order_type === 'technical' && !TECHNICAL_TYPES.has(item.item_type)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'En órdenes de servicio técnico solo se admiten equipos/mantenimiento/instalación',
        path: ['items', i, 'item_type'],
      });
    }

    // Uniform pricing policy: every item needs a positive price.
    if (item.unit_price == null || item.unit_price <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'El precio debe ser mayor a 0',
        path: ['items', i, 'unit_price'],
      });
    }

    if (item.item_type === 'key') {
      if (!item.building_id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'El edificio es obligatorio para ítems de tipo llave',
          path: ['items', i, 'building_id'],
        });
      }
      if (!item.product_id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Seleccioná un modelo de llave (stock)',
          path: ['items', i, 'product_id'],
        });
      }
    }

    if (TECHNICAL_TYPES.has(item.item_type) && !item.building_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'El edificio es obligatorio',
        path: ['items', i, 'building_id'],
      });
    }
  });
});

export type OrdenFormValues = z.infer<typeof schema>;

const ITEM_TYPE_LABELS: Record<string, string> = {
  key: 'Llave',
  equipment: 'Equipo',
  maintenance: 'Mantenimiento',
  installation: 'Instalación',
  equipment_replacement: 'Cambio de equipo',
};

// ---- Default empty values ----

const EMPTY_DEFAULTS: OrdenFormValues = {
  order_type: 'keys',
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

export interface OrdenFormProps {
  mode: 'create' | 'edit';
  /** Required when mode='edit'. Also accepted in create mode as initial values. */
  initialValues?: OrdenFormValues;
  onSubmit: (values: OrdenFormValues) => Promise<void>;
  onCancel?: () => void;
  isPending?: boolean;
}

export function OrdenForm({
  mode,
  initialValues,
  onSubmit,
  onCancel,
  isPending = false,
}: OrdenFormProps) {
  const defaultValues = initialValues ?? EMPTY_DEFAULTS;
  const { data: administrations = [] } = useAdministrations({ status: 'active' });

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    setValue,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<OrdenFormValues>({
    resolver: zodResolver(schema),
    defaultValues,
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  const { data: keyProducts = [] } = useProducts({ category: 'rfid_key' });
  const defaultKeyProductId = keyProducts.length === 1 ? keyProducts[0]!.id : null;

  const appendItem = () => {
    append({
      item_type: watch('order_type') === 'keys' ? 'key' : 'installation',
      quantity: 1,
      description: '',
      building_id:
        watch('client_type') === 'particular'
          ? particular?.unit_building_id ?? null
          : null,
      unit_price: null,
      unit_id:
        watch('order_type') === 'keys' && watch('client_type') === 'particular'
          ? particular?.unit_id ?? null
          : null,
      pickup_particular_id: null,
      pickup_same_as_particular: false,
      product_id: watch('order_type') === 'keys' ? defaultKeyProductId : null,
    });
    // Expand the newly appended item; previous ones collapse automatically.
    setOpenItemIndex(fields.length);
  };

  // Resolve initial particular for pre-fill in edit mode.
  const [particular, setParticular] = useState<ParticularRow | null>(null);
  const [editParticularOpen, setEditParticularOpen] = useState(false);
  const [pickupParticulars, setPickupParticulars] = useState<
    Record<number, ParticularRow | null>
  >({});
  // Only one item card is expanded at a time — collapsing the previous keeps
  // the list scannable when there are many packs.
  const [openItemIndex, setOpenItemIndex] = useState<number | null>(null);

  const clientType = watch('client_type');
  const administrationId = watch('administration_id');
  const items = watch('items');
  const orderType = watch('order_type');

  const { data: buildings = [] } = useBuildings(
    clientType === 'administration' && administrationId
      ? { administrationId }
      : {},
  );

  const handleParticularChange = (p: ParticularRow | null) => {
    setParticular(p);
    setValue('particular_id', p?.id ?? null);
    setValue('particular_full_name', p?.full_name ?? '');
    setValue('particular_dni', p?.dni ?? '');
    setValue('particular_phone', p?.phone ?? '');
    setValue('particular_email', p?.email ?? '');

    items?.forEach((it, idx) => {
      if (it.pickup_same_as_particular) {
        setValue(`items.${idx}.pickup_particular_id`, p?.id ?? null);
        setPickupParticulars((prev) => ({ ...prev, [idx]: p }));
      }
    });
  };

  const handleParticularSaved = (p: ParticularRow) => {
    if (particular && p.id === particular.id) {
      handleParticularChange(p);
    }
  };

  const handleCancel = () => {
    if (
      isDirty &&
      !window.confirm('Vas a perder los cambios. ¿Salir igual?')
    ) {
      return;
    }
    onCancel?.();
  };

  const isFormPending = isPending || isSubmitting;

  const submitLabel = mode === 'edit' ? 'Guardar cambios' : 'Guardar orden';

  return (
    <>
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="flex flex-col gap-8"
        id="orden-form"
      >
        {/* ---- Section: Tipo de orden ---- */}
        <section className="flex flex-col gap-3 rounded-md border p-5">
          <SectionHeading title="Tipo de orden" />
          <Controller
            control={control}
            name="order_type"
            render={({ field }) => (
              <div className="flex flex-wrap items-center gap-2">
                {(
                  [
                    { value: 'keys', label: 'Llaves' },
                    { value: 'technical', label: 'Servicio técnico' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      field.onChange(opt.value);
                      reset({
                        ...watch(),
                        order_type: opt.value,
                        items: [],
                      });
                      setPickupParticulars({});
                      setOpenItemIndex(null);
                    }}
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
        </section>

        {/* ---- Section: Cliente ---- */}
        <section className="flex flex-col gap-4 rounded-md border p-5">
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

        {/* ---- Section: Ítems ---- */}
        <section className="flex flex-col gap-4 rounded-md border p-5">
          <SectionHeading
            title="Ítems"
            description={
              orderType === 'keys'
                ? 'Cada ítem es un pack de llaves con un mismo autorizado a retirar.'
                : 'Cada ítem genera una tarea del área técnica.'
            }
          />

          {errors.items && !Array.isArray(errors.items) && (
            <p className="text-sm text-destructive">{errors.items.message}</p>
          )}

          {fields.map((field, index) => {
            const itemType = items[index]?.item_type;
            const isKey = itemType === 'key';
            const buildingId = items[index]?.building_id ?? null;
            const isOpen = openItemIndex === index;
            const buildingName =
              buildings.find((b) => b.id === buildingId)?.name ?? null;
            const summaryBits: string[] = [];
            if (items[index]?.item_type) {
              summaryBits.push(
                ITEM_TYPE_LABELS[items[index]!.item_type] ?? items[index]!.item_type,
              );
            }
            summaryBits.push(`× ${items[index]?.quantity ?? 1}`);
            if (buildingName) summaryBits.push(buildingName);
            if (items[index]?.description)
              summaryBits.push(items[index]!.description as string);

            return (
              <div
                key={field.id}
                className="flex flex-col gap-3 rounded-md border bg-muted/20"
              >
                {/* Collapsible header — click toggles the card. */}
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
                      Ítem {index + 1}
                    </span>
                    {!isOpen && (
                      <span className="truncate text-sm text-foreground">
                        {summaryBits.join(' · ')}
                      </span>
                    )}
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      remove(index);
                      setPickupParticulars((prev) => {
                        const next = { ...prev };
                        delete next[index];
                        return next;
                      });
                      if (openItemIndex === index) setOpenItemIndex(null);
                    }}
                    className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                  >
                    Eliminar
                  </Button>
                </div>

                {isOpen && (
                <div className="flex flex-col gap-3 border-t px-4 pt-3 pb-4">
                {orderType === 'keys' ? (
                  <input type="hidden" {...register(`items.${index}.item_type`)} />
                ) : (
                  <div className="flex flex-col gap-1">
                    <Label htmlFor={`items.${index}.item_type`}>Tipo</Label>
                    <Controller
                      control={control}
                      name={`items.${index}.item_type`}
                      render={({ field: f }) => (
                        <Select value={f.value} onValueChange={f.onChange}>
                          <SelectTrigger id={`items.${index}.item_type`}>
                            <SelectValue placeholder="Tipo de ítem" />
                          </SelectTrigger>
                          <SelectContent>
                            {(
                              [
                                'equipment',
                                'maintenance',
                                'installation',
                                'equipment_replacement',
                              ] as const
                            ).map((val) => (
                              <SelectItem key={val} value={val}>
                                {ITEM_TYPE_LABELS[val]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    {errors.items?.[index]?.item_type && (
                      <p className="text-xs text-destructive">
                        {errors.items[index]?.item_type?.message}
                      </p>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    <Label htmlFor={`items.${index}.quantity`}>
                      {isKey ? 'Cantidad de llaves del pack' : 'Cantidad'}
                    </Label>
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

                  <div className="flex flex-col gap-1">
                    <Label htmlFor={`items.${index}.description`}>
                      Descripción
                    </Label>
                    <Input
                      id={`items.${index}.description`}
                      placeholder="Descripción opcional"
                      {...register(`items.${index}.description`)}
                    />
                  </div>
                </div>

                {isKey && (
                  <>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="flex flex-col gap-1">
                        <Label htmlFor={`items.${index}.product_id`}>
                          Modelo de llave (stock) *
                        </Label>
                        <Controller
                          control={control}
                          name={`items.${index}.product_id`}
                          render={({ field: f }) => (
                            <Select
                              value={f.value ?? ''}
                              onValueChange={(v) => f.onChange(v || null)}
                            >
                              <SelectTrigger id={`items.${index}.product_id`}>
                                <SelectValue placeholder="Seleccioná un modelo" />
                              </SelectTrigger>
                              <SelectContent>
                                {keyProducts.map((p) => (
                                  <SelectItem key={p.id} value={p.id}>
                                    {p.name} — disponible: {p.stock_disponible}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        />
                        {errors.items?.[index]?.product_id && (
                          <p className="text-xs text-destructive">
                            {errors.items[index]?.product_id?.message}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-col gap-1">
                        <Label htmlFor={`items.${index}.unit_price`}>
                          Precio unitario *
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
                              onChange={(v) => {
                                f.onChange(v);
                                setValue(`items.${index}.unit_id`, null);
                              }}
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

                      <KeyItemUnitField
                        index={index}
                        buildingId={buildingId}
                        control={control}
                        setValue={setValue}
                      />
                    </div>

                    <KeyItemPickupField
                      index={index}
                      control={control}
                      setValue={setValue}
                      register={register}
                      errors={errors}
                      clientType={clientType}
                      clientParticular={particular}
                      selectedPickup={pickupParticulars[index] ?? null}
                      onSelectedPickupChange={(p) =>
                        setPickupParticulars((prev) => ({ ...prev, [index]: p }))
                      }
                    />
                  </>
                )}

                {!isKey && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1">
                      <Label htmlFor={`items.${index}.unit_price`}>
                        Precio unitario *
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
                  </div>
                )}
                </div>
                )}
              </div>
            );
          })}

          {/* Add-item row: always present, empty state or trailing action. */}
          <button
            type="button"
            onClick={appendItem}
            className="flex items-center justify-center gap-2 rounded-md border border-dashed px-3 py-6 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
          >
            <span className="text-lg leading-none">+</span>
            <span>Agregar ítem</span>
          </button>
        </section>

        {/* ---- Section: Notas ---- */}
        <section className="flex flex-col gap-3 rounded-md border p-5">
          <SectionHeading title="Notas" />
          <Textarea
            id="notes"
            placeholder="Observaciones adicionales..."
            rows={3}
            {...register('notes')}
          />
        </section>
      </form>

      {/* Sticky action bar */}
      <div className="sticky bottom-0 border-t bg-background/95 backdrop-blur">
        <div className="flex justify-end gap-2 px-6 py-3">
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
          <Button
            type="submit"
            form="orden-form"
            disabled={isFormPending}
          >
            {isFormPending ? 'Guardando...' : submitLabel}
          </Button>
        </div>
      </div>

      <ParticularFormSheet
        open={editParticularOpen}
        onOpenChange={setEditParticularOpen}
        particular={particular}
        onSaved={handleParticularSaved}
      />
    </>
  );
}

// ------------------------------------------------------------
// Subcomponents (isolated so useUnits fires only for key items)
// ------------------------------------------------------------

interface KeyItemUnitFieldProps {
  index: number;
  buildingId: string | null;
  control: Control<OrdenFormValues>;
  setValue: UseFormSetValue<OrdenFormValues>;
}

function KeyItemUnitField({
  index,
  buildingId,
  control,
  setValue,
}: KeyItemUnitFieldProps) {
  const [quickUnitOpen, setQuickUnitOpen] = useState(false);
  const { data: units = [] } = useUnits(buildingId ?? '');

  const handleUnitCreated = (unitId: string) => {
    setValue(`items.${index}.unit_id`, unitId, { shouldValidate: true });
  };

  return (
    <>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`items.${index}.unit_id`}>Unidad</Label>
        <div className="flex gap-2">
          <div className="flex-1">
            <Controller
              control={control}
              name={`items.${index}.unit_id`}
              render={({ field: f }) => (
                <Select
                  value={f.value ?? ''}
                  onValueChange={(v) => f.onChange(v || null)}
                  disabled={!buildingId}
                >
                  <SelectTrigger id={`items.${index}.unit_id`}>
                    <SelectValue
                      placeholder={
                        buildingId
                          ? 'Seleccioná una unidad'
                          : 'Elegí un edificio primero'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {units.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.number}
                        {u.unit_type ? ` — ${u.unit_type}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setQuickUnitOpen(true)}
            disabled={!buildingId}
            className="shrink-0"
          >
            Nueva
          </Button>
        </div>
      </div>

      {buildingId && (
        <QuickUnitCreateDialog
          open={quickUnitOpen}
          onOpenChange={setQuickUnitOpen}
          buildingId={buildingId}
          onCreated={handleUnitCreated}
        />
      )}
    </>
  );
}

interface KeyItemPickupFieldProps {
  index: number;
  control: Control<OrdenFormValues>;
  setValue: UseFormSetValue<OrdenFormValues>;
  register: UseFormRegister<OrdenFormValues>;
  errors: FieldErrors<OrdenFormValues>;
  clientType: 'administration' | 'particular';
  clientParticular: ParticularRow | null;
  selectedPickup: ParticularRow | null;
  onSelectedPickupChange: (p: ParticularRow | null) => void;
}

function KeyItemPickupField({
  index,
  control,
  setValue,
  register,
  errors,
  clientType,
  clientParticular,
  selectedPickup,
  onSelectedPickupChange,
}: KeyItemPickupFieldProps) {
  const canReuseParticular = clientType === 'particular' && !!clientParticular;

  const handlePickupChange = (p: ParticularRow | null) => {
    onSelectedPickupChange(p);
    setValue(`items.${index}.pickup_particular_id`, p?.id ?? null);
  };

  return (
    <div className="flex flex-col gap-2">
      <Label>Autorizado a retirar</Label>

      <Controller
        control={control}
        name={`items.${index}.pickup_same_as_particular`}
        render={({ field: f }) => (
          <ParticularSelector
            value={selectedPickup}
            onChange={handlePickupChange}
            disabled={Boolean(f.value)}
          />
        )}
      />

      {canReuseParticular && (
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-input"
            {...register(`items.${index}.pickup_same_as_particular`, {
              onChange: (e) => {
                const checked = (e.target as HTMLInputElement).checked;
                if (checked) {
                  onSelectedPickupChange(clientParticular);
                  setValue(
                    `items.${index}.pickup_particular_id`,
                    clientParticular?.id ?? null,
                  );
                } else {
                  onSelectedPickupChange(null);
                  setValue(`items.${index}.pickup_particular_id`, null);
                }
              },
            })}
          />
          <span>Retira la misma persona</span>
        </label>
      )}

      {errors.items?.[index]?.pickup_particular_id && (
        <p className="text-xs text-destructive">
          {errors.items[index]?.pickup_particular_id?.message}
        </p>
      )}
    </div>
  );
}
