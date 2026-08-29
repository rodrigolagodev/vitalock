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
import { Label } from '@/components/ui/label';
import { Textarea } from '@vitalock/ui';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Pencil, Plus, Trash2 } from 'lucide-react';
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

// ---- Draft line schema (focused load panel) ----
// The panel validates ONE line in isolation before it joins the order list.
// Confirmed lines live in the parent form's items array for the final submit.
const draftItemSchema = z.object({
  product_id: z.string().min(1, 'Seleccioná una llave (stock)'),
  quantity: z.coerce
    .number({ invalid_type_error: 'La cantidad debe ser un número' })
    .int()
    .min(1, 'Mínimo 1'),
  unit_price: z.coerce
    .number({ invalid_type_error: 'El precio debe ser un número' })
    .nullable()
    .refine((v) => v !== null && v > 0, {
      message: 'El precio debe ser mayor a 0',
    }),
  building_id: z.string().min(1, 'El edificio es obligatorio para ítems de tipo llave'),
  unit_id: z.string().nullable().optional(),
  pickup_particular_id: z.string().nullable().optional(),
});
type DraftItem = z.infer<typeof draftItemSchema>;

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

  const { fields, append, remove, update } = useFieldArray({ control, name: 'items' });

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

  // ---- Focused line draft (list + load panel) ----
  // The panel edits a single draft line; confirmed lines go into the parent
  // form's `items`. After confirming, model and building are inherited so the
  // next line starts almost complete (Nielsen efficiency + recognition).
  const emptyDraft = (): DraftItem => ({
    product_id: defaultKeyProductId ?? '',
    quantity: 1,
    unit_price: null,
    building_id: '',
    unit_id: null,
    pickup_particular_id: null,
  });

  const draftForm = useForm<DraftItem>({
    resolver: zodResolver(draftItemSchema),
    defaultValues: emptyDraft(),
    mode: 'onTouched',
    reValidateMode: 'onChange',
  });
  const draftControl = draftForm.control;
  const draftErrors = draftForm.formState.errors;
  const draftBuilding = draftForm.watch('building_id');
  const draftUnit = draftForm.watch('unit_id');
  const draftQuantity = draftForm.watch('quantity');

  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draftParticular, setDraftParticular] = useState<ParticularRow | null>(null);

  const startEdit = (index: number) => {
    const item = items[index];
    if (!item) return;
    draftForm.reset({
      product_id: item.product_id ?? '',
      quantity: item.quantity ?? 1,
      unit_price: item.unit_price ?? null,
      building_id: item.building_id ?? '',
      unit_id: item.unit_id ?? null,
      pickup_particular_id: item.pickup_particular_id ?? null,
    });
    setDraftParticular(pickupParticulars[index] ?? null);
    setEditingIndex(index);
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setDraftParticular(null);
    draftForm.reset(emptyDraft());
  };

  const deleteItem = (index: number) => {
    remove(index);
    setPickupParticulars((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
    if (editingIndex === index) {
      cancelEdit();
    }
  };

  const submitDraft = () => {
    void draftForm.handleSubmit((values) => {
      const editingIdx = editingIndex;
      const editing = editingIdx !== null;
      const existing = editing
        ? (items[editingIdx] as
            | (KeyOrderFormValues['items'][number] & { _id?: string })
            | undefined)
        : undefined;
      const nextItem = {
        item_type: 'key' as const,
        description: existing?.description ?? '',
        quantity: values.quantity,
        unit_price: values.unit_price,
        building_id: values.building_id,
        unit_id: values.unit_id,
        pickup_particular_id:
          draftParticular?.id ?? values.pickup_particular_id ?? null,
        product_id: values.product_id,
        ...(existing?._id ? { _id: existing._id } : {}),
      };

      if (editing && editingIdx !== null) {
        update(editingIdx, nextItem as unknown as KeyOrderFormValues['items'][number]);
        setPickupParticulars((prev) => ({
          ...prev,
          [editingIdx]: draftParticular,
        }));
      } else {
        append(nextItem as unknown as KeyOrderFormValues['items'][number]);
        setPickupParticulars((prev) => ({
          ...prev,
          [items.length]: draftParticular,
        }));
      }

      // Inheritance: keep model + building; reset the rest for the next line.
      draftForm.reset({
        product_id: values.product_id,
        quantity: 1,
        unit_price: null,
        building_id: values.building_id,
        unit_id: null,
        pickup_particular_id: null,
      });
      setDraftParticular(null);
      setEditingIndex(null);
    })();
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

        {/* ---- Section: Items (each item is a pack of keys) ---- */}
        <section className="flex flex-col gap-4 rounded-md border p-5 bg-card">
          <SectionHeading
            title="Lista de items"
            description="Cada item es un pack de llaves del mismo modelo, edificio y precio. Cargalo en el panel de abajo y quedará listado arriba; el modelo y el edificio se recuerdan para el siguiente item."
          />

          {errors.items && !Array.isArray(errors.items) && (
            <p className="text-sm text-destructive">{errors.items.message}</p>
          )}

          {/* Confirmed lines summary: compact, one line each, no horizontal scrolling. */}
          {fields.length > 0 && (
            <div className="flex flex-col gap-3" data-testid="key-order-lines">
              {fields.map((field, index) => {
                const item = items[index];
                const product = keyProducts.find(
                  (p) => p.id === item?.product_id,
                );
                const building = buildings.find(
                  (b) => b.id === item?.building_id,
                );
                const lineTotal =
                  (Number(item?.quantity) || 0) *
                  (Number(item?.unit_price) || 0);

                return (
                  <div
                    key={field.id}
                    data-testid={`key-order-line-${index}`}
                    className={[
                      'flex items-center justify-between gap-3 rounded-md border px-4 py-3',
                      editingIndex === index ? 'ring-1 ring-primary' : '',
                    ].join(' ')}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-sm">
                        <span className="font-medium text-muted-foreground">
                          Item {index + 1}
                        </span>
                        <span className="truncate font-medium">
                          {product?.name ?? 'Sin modelo'}
                        </span>
                        <span className="shrink-0 text-muted-foreground">
                          × {item?.quantity ?? 1}
                        </span>
                      </p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {building?.name ?? 'Sin edificio'} ·{' '}
                        {formatCurrencyARS(lineTotal)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 px-0"
                        aria-label={`Editar item ${index + 1}`}
                        onClick={() => startEdit(index)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 px-0 text-destructive hover:text-destructive"
                        aria-label={`Eliminar item ${index + 1}`}
                        onClick={() => deleteItem(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Focused load panel: one line at a time; model + building inherit from the previous line. */}
          <div className="flex flex-col gap-4 rounded-md border bg-muted/30 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">
                {editingIndex !== null
                  ? `Editar item ${editingIndex + 1}`
                  : 'Nuevo item'}
              </p>
              {editingIndex !== null && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={cancelEdit}
                >
                  Cancelar
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Modelo */}
              <div className="flex min-w-0 flex-col gap-2">
                <Label htmlFor="draft-product-id">Llave *</Label>
                <Controller
                  control={draftControl}
                  name="product_id"
                  render={({ field: f }) => (
                    <Select
                      value={f.value ?? ''}
                      onValueChange={(v) => f.onChange(v || null)}
                    >
                      <SelectTrigger
                        id="draft-product-id"
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
                {draftErrors.product_id && (
                  <p className="text-xs text-destructive">
                    {draftErrors.product_id.message}
                  </p>
                )}
              </div>

              {/* Cantidad + Precio: short inputs, side by side to save a row */}
              <div className="flex min-w-0 flex-col gap-2">
                <div className="grid grid-cols-2 items-start gap-4">
                  <div className="flex min-w-0 flex-col gap-2">
                    <Label htmlFor="draft-quantity">Cantidad *</Label>
                    <Input
                      id="draft-quantity"
                      type="number"
                      min={1}
                      aria-label="Cantidad de llaves"
                      {...draftForm.register('quantity')}
                    />
                    {draftErrors.quantity && (
                      <p className="text-xs text-destructive">
                        {draftErrors.quantity.message}
                      </p>
                    )}
                  </div>
                  <div className="flex min-w-0 flex-col gap-2">
                    <Label htmlFor="draft-unit-price">Precio unitario *</Label>
                    <Input
                      id="draft-unit-price"
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="0.00"
                      aria-label="Precio unitario"
                      {...draftForm.register('unit_price')}
                    />
                    {draftErrors.unit_price && (
                      <p className="text-xs text-destructive">
                        {draftErrors.unit_price.message}
                      </p>
                    )}
                  </div>
                </div>
                {(draftQuantity ?? 1) > 1 && (
                  <p className="text-xs text-muted-foreground">
                    Se dividirá en {draftQuantity} llaves individuales.
                  </p>
                )}
              </div>

              {/* Edificio */}
              <div className="flex min-w-0 flex-col gap-2">
                <Label>Edificio *</Label>
                <BuildingCombobox
                  id="draft-building-id"
                  buildings={buildings}
                  value={draftBuilding ?? ''}
                  onChange={(v) => {
                    draftForm.setValue('building_id', v ?? '', {
                      shouldValidate: true,
                    });
                    draftForm.setValue('unit_id', null);
                  }}
                  placeholder="Buscar por nombre o dirección"
                />
                {draftErrors.building_id && (
                  <p className="text-xs text-destructive">
                    {draftErrors.building_id.message}
                  </p>
                )}
              </div>

              {/* Unidad */}
              <div className="flex min-w-0 flex-col gap-2">
                <Label>Unidad</Label>
                <KeyItemUnitField
                  buildingId={draftBuilding || null}
                  value={draftUnit ?? null}
                  onChange={(v) => draftForm.setValue('unit_id', v)}
                  error={draftErrors.unit_id?.message}
                />
              </div>

              {/* Autorizado a retirar */}
              <div className="flex min-w-0 flex-col gap-1 sm:col-span-2">
                <Label>Autorizado a retirar</Label>
                <ParticularSelector
                  value={draftParticular}
                  onChange={(p) =>
                    setDraftParticular(p as ParticularRow | null)
                  }
                  className="w-full"
                />
              </div>
            </div>

            <div className="flex">
              <Button
                type="button"
                className="w-full gap-2"
                onClick={submitDraft}
              >
                {editingIndex !== null ? (
                  'Guardar cambios'
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    Agregar item
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Totals live OUTSIDE the scroll container: always visible on any screen. */}
          <div
            data-testid="lines-totals"
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/40 px-4 py-3 text-sm"
          >
            <span className="text-muted-foreground">
              {items.length} {items.length === 1 ? 'item' : 'items'} ·{' '}
              {keysCount} {keysCount === 1 ? 'llave' : 'llaves'}
            </span>
            <span className="font-medium">
              Total:{' '}
              <span className="tabular-nums">
                {formatCurrencyARS(totalPrice)}
              </span>
            </span>
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
            disabled={!buildingId}
          >
            <SelectTrigger id="draft-unit-id" aria-label="Unidad de la llave">
              <SelectValue
                placeholder={
                  buildingId ? 'Seleccioná una unidad' : 'Primero elegí edificio'
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
