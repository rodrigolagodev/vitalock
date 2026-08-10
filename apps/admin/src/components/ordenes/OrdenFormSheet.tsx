import { useEffect } from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
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
});

const baseSchema = z.object({
  client_type: z.enum(['administration', 'particular']),
  administration_id: z.string().optional().nullable(),
  particular_full_name: z.string().optional(),
  particular_dni: z.string().optional(),
  particular_phone: z.string().optional(),
  particular_email: z.string().email('Email inválido').optional().or(z.literal('')),
  notes: z.string().optional(),
  items: z.array(itemSchema).min(1, 'Agregá al menos un ítem'),
});

const schema = baseSchema
  .superRefine((data, ctx) => {
    if (data.client_type === 'administration' && !data.administration_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Seleccioná una administración',
        path: ['administration_id'],
      });
    }
    if (
      data.client_type === 'particular' &&
      (!data.particular_full_name || data.particular_full_name.trim() === '')
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'El nombre completo es obligatorio',
        path: ['particular_full_name'],
      });
    }
    data.items.forEach((item, i) => {
      if (item.item_type === 'key' && !item.building_id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'El edificio es obligatorio para ítems de tipo llave',
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
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      client_type: 'administration',
      administration_id: null,
      particular_full_name: '',
      particular_dni: '',
      particular_phone: '',
      particular_email: '',
      notes: '',
      items: [],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  const clientType = watch('client_type');
  const administrationId = watch('administration_id');
  const items = watch('items');

  // Buildings for building_id select — scoped to selected administration if client_type = administration
  const { data: buildings = [] } = useBuildings(
    clientType === 'administration' && administrationId
      ? { administrationId }
      : {},
  );

  useEffect(() => {
    if (open) {
      reset({
        client_type: 'administration',
        administration_id: null,
        particular_full_name: '',
        particular_dni: '',
        particular_phone: '',
        particular_email: '',
        notes: '',
        items: [],
      });
    }
  }, [open, reset]);

  const onSubmit = async (values: FormValues) => {
    try {
      await createOrden.mutateAsync({
        order: {
          client_type: values.client_type,
          administration_id: values.administration_id ?? null,
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
        })),
      });
      onOpenChange(false);
    } catch (err) {
      toastMutationError(err as Error);
    }
  };

  const isPending = createOrden.isPending;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col gap-0 sm:max-w-lg overflow-y-auto">
        <SheetHeader className="p-6 pb-4">
          <SheetTitle>Nueva orden</SheetTitle>
        </SheetHeader>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-1 flex-col gap-6 px-6"
        >
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

          {/* ---- Particular fields ---- */}
          {clientType === 'particular' && (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="particular_full_name">Nombre completo *</Label>
                <Input
                  id="particular_full_name"
                  placeholder="Ej. Juan García"
                  {...register('particular_full_name')}
                />
                {errors.particular_full_name && (
                  <p className="text-sm text-destructive">
                    {errors.particular_full_name.message}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="particular_dni">DNI</Label>
                <Input
                  id="particular_dni"
                  placeholder="Ej. 28123456"
                  {...register('particular_dni')}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="particular_phone">Teléfono</Label>
                <Input
                  id="particular_phone"
                  placeholder="Ej. +54 11 1234-5678"
                  {...register('particular_phone')}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="particular_email">Email</Label>
                <Input
                  id="particular_email"
                  type="email"
                  placeholder="Ej. juan@mail.com"
                  {...register('particular_email')}
                />
                {errors.particular_email && (
                  <p className="text-sm text-destructive">
                    {errors.particular_email.message}
                  </p>
                )}
              </div>
            </>
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
                    item_type: 'key',
                    quantity: 1,
                    description: '',
                    building_id: null,
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
                      onClick={() => remove(index)}
                      className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                    >
                      Eliminar
                    </Button>
                  </div>

                  {/* Item type */}
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
                            {Object.entries(ITEM_TYPE_LABELS).map(([val, label]) => (
                              <SelectItem key={val} value={val}>
                                {label}
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

                  {/* Building (only for key items) */}
                  {isKey && (
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
  );
}
