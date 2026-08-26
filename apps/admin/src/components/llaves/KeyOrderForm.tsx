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
import { QuickUnitCreateDialog } from '@/components/llaves/QuickUnitCreateDialog';
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
import type { KeyOrderDetailRow } from '@/hooks/useKeyOrder';

// ---- Zod schema ----

const itemSchema = z.object({
  item_type: z.literal('key'),
  quantity: z.coerce
    .number({ invalid_type_error: 'La cantidad debe ser un número' })
    .int()
    .min(1, 'Mínimo 1'),
  description: z.string().optional(),
  // Kept optional at the field level so the input can be empty during editing;
  // required-ness is enforced in superRefine below with a client-consistency-aware message.
  building_id: z.string().optional().nullable(),
  unit_price: z.coerce
    .number({ invalid_type_error: 'El precio debe ser un número' })
    .optional()
    .nullable(),
  unit_id: z.string().optional().nullable(),
  pickup_particular_id: z.string().optional().nullable(),
  product_id: z.string().optional().nullable(),
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
    // Price is always required for key items (price_required CHECK in DB).
    if (item.unit_price == null || item.unit_price <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'El precio debe ser mayor a 0',
        path: ['items', i, 'unit_price'],
      });
    }
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
  });
});

export type KeyOrderFormValues = z.infer<typeof schema>;

// ---- Empty defaults ----

const EMPTY_DEFAULTS: KeyOrderFormValues = {
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

export interface KeyOrderFormProps {
  mode: 'create' | 'edit';
  /** Provide pre-filled values directly (useful in tests). */
  initialValues?: KeyOrderFormValues;
  /** Required when mode='edit'. Provides the existing order data for defaults and concurrency token. */
  initialOrder?: KeyOrderDetailRow;
  onSubmit: (values: KeyOrderFormValues) => Promise<void>;
  onCancel?: () => void;
  isPending?: boolean;
}

function buildInitialValues(order: KeyOrderDetailRow): KeyOrderFormValues {
  return {
    client_type: order.client_type,
    administration_id: order.administration_id ?? null,
    particular_id: order.particular_id ?? null,
    particular_full_name: order.particular_full_name ?? '',
    particular_dni: order.particular_dni ?? '',
    particular_phone: order.particular_phone ?? '',
    particular_email: order.particular_email ?? '',
    notes: order.notes ?? '',
    items: order.key_order_items.map((item) => ({
      item_type: 'key' as const,
      quantity: item.quantity,
      description: item.description ?? '',
      building_id: item.building_id ?? null,
      unit_price: item.unit_price ?? null,
      unit_id: item.unit_id ?? null,
      pickup_particular_id: item.pickup_particular_id ?? null,
      product_id: item.product_id ?? null,
      // Carry the existing item id so the RPC can UPDATE rather than INSERT.
      _id: item.id,
    })),
  };
}

export function KeyOrderForm({
  mode,
  initialValues,
  initialOrder,
  onSubmit,
  onCancel,
  isPending = false,
}: KeyOrderFormProps) {
  // Derive defaults: explicit initialValues take priority, then initialOrder, then EMPTY_DEFAULTS.
  const defaultValues = initialValues ?? (initialOrder ? buildInitialValues(initialOrder) : EMPTY_DEFAULTS);

  const { data: administrations = [] } = useAdministrations({ status: 'active' });

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<KeyOrderFormValues>({
    resolver: zodResolver(schema),
    defaultValues,
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  const { data: keyProducts = [] } = useProducts({ category: 'rfid_key' });
  const defaultKeyProductId = keyProducts.length === 1 ? keyProducts[0]!.id : null;

  const [particular, setParticular] = useState<ParticularRow | null>(null);
  const [editParticularOpen, setEditParticularOpen] = useState(false);
  const [pickupParticulars, setPickupParticulars] = useState<
    Record<number, ParticularRow | null>
  >({});
  const [openItemIndex, setOpenItemIndex] = useState<number | null>(null);

  const clientType = watch('client_type');
  const administrationId = watch('administration_id');
  const items = watch('items');

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

  const appendItem = () => {
    append({
      item_type: 'key',
      quantity: 1,
      description: '',
      building_id: null,
      unit_price: null,
      unit_id: null,
      pickup_particular_id: null,
      product_id: defaultKeyProductId,
    });
    setOpenItemIndex(fields.length);
  };

  const isFormPending = isPending || isSubmitting;
  const submitLabel =
    mode === 'edit' ? 'Guardar cambios' : 'Crear y confirmar orden';

  return (
    <>
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="flex flex-col gap-8"
        id="key-order-form"
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

        {/* ---- Section: Líneas de llave ---- */}
        <section className="flex flex-col gap-4 rounded-md border p-5 bg-card">
          <SectionHeading
            title="Líneas de llave"
            description="Cada línea es un pack de llaves con el mismo edificio y precio."
          />

          {errors.items && !Array.isArray(errors.items) && (
            <p className="text-sm text-destructive">{errors.items.message}</p>
          )}

          {fields.map((field, index) => {
            const item = items[index];
            const buildingId = item?.building_id ?? null;
            const isOpen = openItemIndex === index;
            const buildingName =
              buildings.find((b) => b.id === buildingId)?.name ?? null;

            const summaryBits: string[] = ['Llave'];
            if ((item?.quantity ?? 1) > 1) {
              summaryBits.push(`× ${item?.quantity}`);
            }
            if (buildingName) summaryBits.push(buildingName);

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
                      Llave {index + 1}
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
                    aria-label={`Eliminar llave ${index + 1}`}
                  >
                    Eliminar
                  </Button>
                </div>

                {isOpen && (
                  <div className="flex flex-col gap-3 border-t px-4 pt-3 pb-4">
                    {/* item_type is always 'key' — hidden field to satisfy RHF schema */}
                    <input type="hidden" {...register(`items.${index}.item_type`)} value="key" />

                    <div className="flex flex-col gap-1 sm:max-w-[240px]">
                      <Label htmlFor={`items.${index}.quantity`}>
                        Cantidad de llaves del pack
                      </Label>
                      <Input
                        id={`items.${index}.quantity`}
                        type="number"
                        min={1}
                        {...register(`items.${index}.quantity`)}
                      />
                      {(item?.quantity ?? 1) > 1 && (
                        <p className="text-xs text-muted-foreground">
                          Se dividirá en {item?.quantity} llaves individuales.
                        </p>
                      )}
                      {errors.items?.[index]?.quantity && (
                        <p className="text-xs text-destructive">
                          {errors.items[index]?.quantity?.message}
                        </p>
                      )}
                    </div>

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
                        errors={errors}
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <Label htmlFor={`items.${index}.pickup_particular_id`}>
                        Persona de retiro (opcional)
                      </Label>
                      <Controller
                        control={control}
                        name={`items.${index}.pickup_particular_id`}
                        render={({ field: f }) => (
                          <ParticularSelector
                            value={pickupParticulars[index] ?? null}
                            onChange={(p) => {
                              const pp = p as ParticularRow | null;
                              setPickupParticulars((prev) => ({ ...prev, [index]: pp }));
                              f.onChange(pp?.id ?? null);
                            }}
                          />
                        )}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={appendItem}
            className="self-start"
          >
            + Agregar línea
          </Button>
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

// ---- KeyItemUnitField sub-component ----

import type { Control, FieldErrors } from 'react-hook-form';

interface KeyItemUnitFieldProps {
  index: number;
  buildingId: string | null | undefined;
  control: Control<KeyOrderFormValues>;
  errors: FieldErrors<KeyOrderFormValues>;
}

function KeyItemUnitField({
  index,
  buildingId,
  control,
  errors,
}: KeyItemUnitFieldProps) {
  const [quickUnitOpen, setQuickUnitOpen] = useState(false);
  const { data: units = [] } = useUnits(buildingId ?? '');

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Label htmlFor={`items.${index}.unit_id`}>Unidad</Label>
        {buildingId && (
          <QuickUnitCreateDialog
            open={quickUnitOpen}
            onOpenChange={setQuickUnitOpen}
            buildingId={buildingId}
            onCreated={() => setQuickUnitOpen(false)}
          />
        )}
      </div>
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
              <SelectValue placeholder={buildingId ? 'Seleccioná una unidad' : 'Primero elegí edificio'} />
            </SelectTrigger>
            <SelectContent>
              {units.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.number}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
      {errors.items?.[index]?.unit_id && (
        <p className="text-xs text-destructive">
          {errors.items[index]?.unit_id?.message}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Opcional acá — si no la asignás ahora, se pedirá al configurar la llave.
      </p>
    </div>
  );
}
