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
import { QuickUnitCreateDialog } from '@/components/llaves/QuickUnitCreateDialog';
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
import { RadioGroup, RadioGroupItem } from '@vitalock/ui';
import { Plus, Trash2 } from 'lucide-react';
import { formatCurrencyARS } from '@/lib/format';
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
        message: 'Seleccioná una llave (stock)',
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

  const clientType = watch('client_type');
  const administrationId = watch('administration_id');
  const items = watch('items');

  // Live totals for the lines table (visibility of system status).
  const keysCount = items.reduce(
    (acc, it) => acc + (Number(it?.quantity) || 0),
    0,
  );
  const totalPrice = items.reduce(
    (acc, it) =>
      acc + (Number(it?.quantity) || 0) * (Number(it?.unit_price) || 0),
    0,
  );

  // ---- Item cards (list-first, one card per item) ----
  // Each item in `items` is rendered as an expandable card. Adding an item
  // pushes a new empty row and auto-expands it. No hidden draft state.
  const [openItemIndex, setOpenItemIndex] = useState<number | null>(null);

  const emptyItem = (): KeyOrderFormValues['items'][number] => ({
    item_type: 'key' as const,
    description: '',
    quantity: 1,
    unit_price: null,
    building_id: null,
    unit_id: null,
    pickup_particular_id: null,
    product_id: defaultKeyProductId,
  });

  const appendItem = () => {
    append(emptyItem());
    setOpenItemIndex(fields.length);
  };

  const deleteItem = (index: number) => {
    remove(index);
    setPickupParticulars((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
    if (openItemIndex === index) setOpenItemIndex(null);
  };

  const setItemPickupParticular = (index: number, p: ParticularRow | null) => {
    setPickupParticulars((prev) => ({ ...prev, [index]: p }));
    setValue(`items.${index}.pickup_particular_id`, p?.id ?? null, {
      shouldValidate: true,
    });
  };

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
                    value={field.value}
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

        {/* ---- Section: Ítems (item cards inline) ---- */}
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={appendItem}
            >
              <Plus className="h-4 w-4" />
              Agregar ítem
            </Button>
          </div>

          {errors.items && !Array.isArray(errors.items) && (
            <p className="text-sm text-destructive">{errors.items.message}</p>
          )}

          <div className="flex flex-col gap-3" data-testid="key-order-items">
              {fields.map((field, index) => {
                const item = items[index];
                const isOpen = openItemIndex === index;
                const product = keyProducts.find(
                  (p) => p.id === item?.product_id,
                );
                const building = buildings.find(
                  (b) => b.id === item?.building_id,
                );
                const buildingId = item?.building_id ?? null;
                const lineTotal =
                  (Number(item?.quantity) || 0) *
                  (Number(item?.unit_price) || 0);
                const itemErrors = errors.items?.[index];

                return (
                  <div
                    key={field.id}
                    data-testid={`key-order-item-${index}`}
                    className="flex flex-col rounded-md border bg-muted/20"
                  >
                    {/* Header (always visible) */}
                    <div className="flex items-center gap-3 p-3">
                      <button
                        type="button"
                        onClick={() =>
                          setOpenItemIndex(isOpen ? null : index)
                        }
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
                          {product && (
                            <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200 truncate max-w-[200px]">
                              {product.name}
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground">
                            ×{item?.quantity ?? 1}
                          </span>
                          {building && (
                            <>
                              <span className="text-xs text-muted-foreground">·</span>
                              <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                                {building.name}
                              </span>
                            </>
                          )}
                          {(Number(item?.unit_price) || 0) > 0 && (
                            <>
                              <span className="text-xs text-muted-foreground">·</span>
                              <span className="text-xs font-medium tabular-nums">
                                {formatCurrencyARS(lineTotal)}
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
                        onClick={() => deleteItem(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    {/* Error summary visible even when collapsed */}
                    {!isOpen && itemErrors && (
                      <div className="px-3 pb-3 flex flex-col gap-1">
                        {itemErrors.product_id && (
                          <p className="text-xs text-destructive">
                            {itemErrors.product_id.message}
                          </p>
                        )}
                        {itemErrors.building_id && (
                          <p className="text-xs text-destructive">
                            {itemErrors.building_id.message}
                          </p>
                        )}
                        {itemErrors.unit_price && (
                          <p className="text-xs text-destructive">
                            {itemErrors.unit_price.message}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Body (expanded) */}
                    {isOpen && (
                      <div className="p-4 border-t bg-card grid grid-cols-1 gap-4 sm:grid-cols-2">
                        {/* Producto */}
                        <div className="flex min-w-0 flex-col gap-2 sm:col-span-2">
                          <Label htmlFor={`items.${index}.product_id`}>
                            Llave *
                          </Label>
                          <Controller
                            control={control}
                            name={`items.${index}.product_id`}
                            render={({ field: f }) => (
                              <Select
                                value={f.value ?? ''}
                                onValueChange={(v) => f.onChange(v || null)}
                              >
                                <SelectTrigger
                                  id={`items.${index}.product_id`}
                                  aria-label="Llave"
                                >
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
                          {itemErrors?.product_id && (
                            <p className="text-xs text-destructive">
                              {itemErrors.product_id.message}
                            </p>
                          )}
                        </div>

                        {/* Cantidad */}
                        <div className="flex min-w-0 flex-col gap-2">
                          <Label htmlFor={`items.${index}.quantity`}>
                            Cantidad *
                          </Label>
                          <Input
                            id={`items.${index}.quantity`}
                            type="number"
                            min={1}
                            aria-label="Cantidad de llaves"
                            {...register(`items.${index}.quantity`)}
                          />
                          {itemErrors?.quantity && (
                            <p className="text-xs text-destructive">
                              {itemErrors.quantity.message}
                            </p>
                          )}
                          {(Number(item?.quantity) || 0) > 1 && (
                            <p className="text-xs text-muted-foreground">
                              Se dividirá en {item?.quantity} llaves individuales.
                            </p>
                          )}
                        </div>

                        {/* Precio unitario */}
                        <div className="flex min-w-0 flex-col gap-2">
                          <Label htmlFor={`items.${index}.unit_price`}>
                            Precio unitario *
                          </Label>
                          <Input
                            id={`items.${index}.unit_price`}
                            type="number"
                            min={0}
                            step="0.01"
                            placeholder="0.00"
                            aria-label="Precio unitario"
                            {...register(`items.${index}.unit_price`)}
                          />
                          {itemErrors?.unit_price && (
                            <p className="text-xs text-destructive">
                              {itemErrors.unit_price.message}
                            </p>
                          )}
                        </div>

                        {/* Edificio */}
                        <div className="flex min-w-0 flex-col gap-2">
                          <Label>Edificio *</Label>
                          <Controller
                            control={control}
                            name={`items.${index}.building_id`}
                            render={({ field: f }) => (
                              <BuildingCombobox
                                id={`items.${index}.building_id`}
                                buildings={buildings}
                                value={f.value ?? ''}
                                onChange={(v) => {
                                  f.onChange(v ?? null);
                                  // Clear unit when building changes; the previously
                                  // selected unit belongs to a different building.
                                  setValue(`items.${index}.unit_id`, null);
                                }}
                                placeholder="Buscar por nombre o dirección"
                              />
                            )}
                          />
                          {itemErrors?.building_id && (
                            <p className="text-xs text-destructive">
                              {itemErrors.building_id.message}
                            </p>
                          )}
                        </div>

                        {/* Unidad */}
                        <div className="flex min-w-0 flex-col gap-2">
                          <Label>Unidad</Label>
                          <KeyItemUnitField
                            buildingId={buildingId}
                            value={item?.unit_id ?? null}
                            onChange={(v) =>
                              setValue(`items.${index}.unit_id`, v)
                            }
                            error={itemErrors?.unit_id?.message}
                          />
                        </div>

                        {/* Autorizado a retirar */}
                        <div className="flex min-w-0 flex-col gap-1 sm:col-span-2">
                          <Label>Autorizado a retirar</Label>
                          <ParticularSelector
                            value={pickupParticulars[index] ?? null}
                            onChange={(p) =>
                              setItemPickupParticular(index, p)
                            }
                            className="w-full"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Ghost slot: dashed placeholder that hints "there's room for
                  more". Visual only — the single entry point for adding an
                  item is the "Agregar ítem" button in the section header. */}
              <div
                data-testid="key-order-item-ghost"
                className="rounded-md border-2 border-dashed border-border bg-muted/10 p-6 text-center text-sm text-muted-foreground"
              >
                {fields.length === 0
                  ? 'La orden todavía no tiene ítems. Agregá el primero desde “Agregar ítem”.'
                  : 'Hay lugar para más ítems.'}
              </div>
            </div>

          {/* Totals — always visible below the item list */}
          {fields.length > 0 && (
            <div
              data-testid="lines-totals"
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/40 px-4 py-3 text-sm"
            >
              <span className="text-muted-foreground">
                {items.length} {items.length === 1 ? 'ítem' : 'ítems'} ·{' '}
                {keysCount} {keysCount === 1 ? 'llave' : 'llaves'}
              </span>
              <span className="font-medium">
                Total:{' '}
                <span className="tabular-nums">
                  {formatCurrencyARS(totalPrice)}
                </span>
              </span>
            </div>
          )}
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
// Bound to the draft panel: one unit selection, controlled by value/onChange.

interface KeyItemUnitFieldProps {
  buildingId: string | null | undefined;
  value: string | null | undefined;
  onChange: (v: string | null) => void;
  error?: string;
}

function KeyItemUnitField({
  buildingId,
  value,
  onChange,
  error,
}: KeyItemUnitFieldProps) {
  const [quickUnitOpen, setQuickUnitOpen] = useState(false);
  const { data: units = [] } = useUnits(buildingId ?? '');

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <Select
            value={value ?? ''}
            onValueChange={(v) => onChange(v || null)}
            disabled={!buildingId || units.length === 0}
          >
            <SelectTrigger id="draft-unit-id" aria-label="Unidad de la llave">
              <SelectValue
                placeholder={
                  !buildingId
                    ? 'Primero elegí edificio'
                    : units.length === 0
                      ? 'Sin unidades — creá una con +'
                      : 'Seleccioná una unidad'
                }
              />
            </SelectTrigger>
            <SelectContent>
              {units.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.number}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-11 w-11 shrink-0 px-0"
          aria-label="Crear unidad"
          disabled={!buildingId}
          onClick={() => setQuickUnitOpen(true)}
        >
          <Plus className="h-4 w-4" />
        </Button>
        {buildingId && (
          <QuickUnitCreateDialog
            open={quickUnitOpen}
            onOpenChange={setQuickUnitOpen}
            buildingId={buildingId}
            onCreated={(unitId) => {
              onChange(unitId);
              setQuickUnitOpen(false);
            }}
          />
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
