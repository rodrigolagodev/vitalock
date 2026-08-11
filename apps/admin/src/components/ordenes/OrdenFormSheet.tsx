import { useEffect, useState } from 'react';
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
import { ParticularSelector } from '../particulares/ParticularSelector';
import { ParticularFormSheet } from '../particulares/ParticularFormSheet';
import type { ParticularRow } from '@/hooks/useParticulares';
import { QuickUnitCreateDialog } from './QuickUnitCreateDialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useMutateOrden } from '@/hooks/useMutateOrden';
import { useAdministrations } from '@/hooks/useAdministrations';
import { useBuildings } from '@/hooks/useBuildings';
import { useUnits } from '@/hooks/useUnits';
import { useProducts } from '@/hooks/useProducts';
import { toastMutationError } from '@/hooks/mapMutationError';

// ---- Zod schema ----

const itemSchema = z.object({
  item_type: z.enum(['key', 'equipment', 'maintenance', 'installation'], {
    required_error: 'El tipo es obligatorio',
  }),
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
const TECHNICAL_TYPES = new Set(['equipment', 'maintenance', 'installation']);

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
    // Consistency: order_type gates item_type.
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

    if (item.item_type === 'key') {
      if (!item.building_id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'El edificio es obligatorio para ítems de tipo llave',
          path: ['items', i, 'building_id'],
        });
      }
      if (item.unit_price == null || item.unit_price <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'El precio debe ser mayor a 0',
          path: ['items', i, 'unit_price'],
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

    // Technical items: building is required so the ticket can be created.
    if (
      TECHNICAL_TYPES.has(item.item_type) &&
      !item.building_id
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'El edificio es obligatorio',
        path: ['items', i, 'building_id'],
      });
    }
  });
});

type FormValues = z.infer<typeof schema>;

const ITEM_TYPE_LABELS: Record<string, string> = {
  key: 'Llave',
  equipment: 'Equipo',
  maintenance: 'Mantenimiento',
  installation: 'Instalación',
};

interface OrdenFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OrdenFormSheet({ open, onOpenChange }: OrdenFormSheetProps) {
  const { createOrden } = useMutateOrden();
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
    defaultValues: {
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
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  const [particular, setParticular] = useState<ParticularRow | null>(null);
  const [editParticularOpen, setEditParticularOpen] = useState(false);
  // Per-item pickup particular rows (only for display in ParticularSelector).
  const [pickupParticulars, setPickupParticulars] = useState<
    Record<number, ParticularRow | null>
  >({});

  const clientType = watch('client_type');
  const administrationId = watch('administration_id');
  const items = watch('items');

  const { data: buildings = [] } = useBuildings(
    clientType === 'administration' && administrationId
      ? { administrationId }
      : {},
  );
  const { data: keyProducts = [] } = useProducts({ category: 'rfid_key' });
  const defaultKeyProductId = keyProducts.length === 1 ? keyProducts[0]!.id : null;

  const orderType = watch('order_type');

  useEffect(() => {
    if (open) {
      reset({
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
      });
      setParticular(null);
      setPickupParticulars({});
    }
  }, [open, reset]);

  const handleParticularChange = (p: ParticularRow | null) => {
    setParticular(p);
    setValue('particular_id', p?.id ?? null);
    setValue('particular_full_name', p?.full_name ?? '');
    setValue('particular_dni', p?.dni ?? '');
    setValue('particular_phone', p?.phone ?? '');
    setValue('particular_email', p?.email ?? '');

    // Re-sync any item currently mirroring the client particular for pickup.
    items?.forEach((it, idx) => {
      if (it.pickup_same_as_particular) {
        setValue(`items.${idx}.pickup_particular_id`, p?.id ?? null);
        setPickupParticulars((prev) => ({ ...prev, [idx]: p }));
      }
    });
  };

  // After editing the selected particular in the side sheet, refresh the local
  // snapshot so subsequent renders (item prefill, autofilled flat fields) see
  // the fresh data without waiting for the user to reopen the combobox.
  const handleParticularSaved = (p: ParticularRow) => {
    if (particular && p.id === particular.id) {
      handleParticularChange(p);
    }
  };

  const onSubmit = async (values: FormValues) => {
    try {
      await createOrden.mutateAsync({
        order: {
          order_type: values.order_type,
          client_type: values.client_type,
          administration_id: values.administration_id ?? null,
          particular_id: values.particular_id ?? null,
          particular_full_name: values.particular_full_name || null,
          particular_dni: values.particular_dni || null,
          particular_phone: values.particular_phone || null,
          particular_email: values.particular_email || null,
          notes: values.notes || null,
          status: 'draft',
        },
        items: values.items.map((item) => ({
          item_type: item.item_type,
          quantity: item.quantity,
          description: item.description || null,
          building_id: item.building_id ?? null,
          unit_price: item.item_type === 'key' ? (item.unit_price ?? null) : null,
          unit_id: item.unit_id ?? null,
          pickup_particular_id: item.pickup_particular_id ?? null,
          product_id: item.product_id ?? null,
        })),
      });
      onOpenChange(false);
    } catch (err) {
      toastMutationError(err as Error);
    }
  };

  const isPending = createOrden.isPending;

  return (
    <>
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col gap-0 sm:max-w-lg overflow-y-auto">
        <SheetHeader className="p-6 pb-4">
          <SheetTitle>Nueva orden</SheetTitle>
        </SheetHeader>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-1 flex-col gap-6 px-6"
        >
          {/* ---- Order type ---- */}
          <div className="flex flex-col gap-2">
            <Label>Tipo de orden *</Label>
            <Controller
              control={control}
              name="order_type"
              render={({ field }) => (
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      value="keys"
                      checked={field.value === 'keys'}
                      onChange={() => {
                        field.onChange('keys');
                        // Type switch invalidates any items already added.
                        reset({
                          ...watch(),
                          order_type: 'keys',
                          items: [],
                        });
                        setPickupParticulars({});
                      }}
                    />
                    <span className="text-sm">Llaves</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      value="technical"
                      checked={field.value === 'technical'}
                      onChange={() => {
                        field.onChange('technical');
                        reset({
                          ...watch(),
                          order_type: 'technical',
                          items: [],
                        });
                        setPickupParticulars({});
                      }}
                    />
                    <span className="text-sm">Servicio técnico</span>
                  </label>
                </div>
              )}
            />
          </div>

          {/* ---- Client type ---- */}
          <div className="flex flex-col gap-2">
            <Label>Tipo de cliente *</Label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  value="administration"
                  {...register('client_type')}
                />
                <span className="text-sm">Administración</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  value="particular"
                  {...register('client_type')}
                />
                <span className="text-sm">Particular</span>
              </label>
            </div>
          </div>

          {/* ---- Administration select ---- */}
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

          {/* ---- Particular selector ---- */}
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

          {/* ---- Items field array ---- */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <Label>Ítems *</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  append({
                    // Default item_type per order_type so the initial row makes
                    // sense; the user can still switch inside the technical set.
                    item_type: orderType === 'keys' ? 'key' : 'installation',
                    quantity: 1,
                    description: '',
                    building_id:
                      clientType === 'particular'
                        ? particular?.unit_building_id ?? null
                        : null,
                    unit_price: null,
                    unit_id:
                      orderType === 'keys' && clientType === 'particular'
                        ? particular?.unit_id ?? null
                        : null,
                    pickup_particular_id: null,
                    pickup_same_as_particular: false,
                    product_id:
                      orderType === 'keys' ? defaultKeyProductId : null,
                  })
                }
              >
                + Agregar ítem
              </Button>
            </div>

            {errors.items && !Array.isArray(errors.items) && (
              <p className="text-sm text-destructive">{errors.items.message}</p>
            )}

            {fields.map((field, index) => {
              const itemType = items[index]?.item_type;
              const isKey = itemType === 'key';
              const buildingId = items[index]?.building_id ?? null;

              return (
                <div
                  key={field.id}
                  className="flex flex-col gap-2 rounded-md border p-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">
                      Ítem {index + 1}
                    </span>
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
                      }}
                      className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                    >
                      Eliminar
                    </Button>
                  </div>

                  {/* Item type — filtered by order_type */}
                  {orderType === 'keys' ? (
                    // Keys orders only have one item_type; skip the picker.
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
                              {(['equipment', 'maintenance', 'installation'] as const).map(
                                (val) => (
                                  <SelectItem key={val} value={val}>
                                    {ITEM_TYPE_LABELS[val]}
                                  </SelectItem>
                                ),
                              )}
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

                  {/* Quantity */}
                  <div className="flex flex-col gap-1">
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

                  {/* Description */}
                  <div className="flex flex-col gap-1">
                    <Label htmlFor={`items.${index}.description`}>Descripción</Label>
                    <Input
                      id={`items.${index}.description`}
                      placeholder="Descripción opcional"
                      {...register(`items.${index}.description`)}
                    />
                  </div>

                  {isKey && (
                    <>
                      {/* Product (stock SKU) */}
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

                      {/* Unit price */}
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

                      {/* Building */}
                      <div className="flex flex-col gap-1">
                        <Label htmlFor={`items.${index}.building_id`}>
                          Edificio *
                        </Label>
                        <Controller
                          control={control}
                          name={`items.${index}.building_id`}
                          render={({ field: f }) => (
                            <Select
                              value={f.value ?? ''}
                              onValueChange={(v) => {
                                f.onChange(v || null);
                                // Building change invalidates unit selection.
                                setValue(`items.${index}.unit_id`, null);
                              }}
                            >
                              <SelectTrigger id={`items.${index}.building_id`}>
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

                  {/* Technical items: only building is required. */}
                  {!isKey && (
                    <div className="flex flex-col gap-1">
                      <Label htmlFor={`items.${index}.building_id`}>
                        Edificio *
                      </Label>
                      <Controller
                        control={control}
                        name={`items.${index}.building_id`}
                        render={({ field: f }) => (
                          <Select
                            value={f.value ?? ''}
                            onValueChange={(v) => f.onChange(v || null)}
                          >
                            <SelectTrigger id={`items.${index}.building_id`}>
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
                      {errors.items?.[index]?.building_id && (
                        <p className="text-xs text-destructive">
                          {errors.items[index]?.building_id?.message}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ---- Notes ---- */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="notes">Notas</Label>
            <Textarea
              id="notes"
              placeholder="Observaciones adicionales..."
              rows={3}
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
  control: Control<FormValues>;
  setValue: UseFormSetValue<FormValues>;
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
                        buildingId ? 'Seleccioná una unidad' : 'Elegí un edificio primero'
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
  control: Control<FormValues>;
  setValue: UseFormSetValue<FormValues>;
  register: UseFormRegister<FormValues>;
  errors: FieldErrors<FormValues>;
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
