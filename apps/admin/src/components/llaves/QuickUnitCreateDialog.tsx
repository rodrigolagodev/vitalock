import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@vitalock/ui';
import { Button } from '@vitalock/ui';
import { Input } from '@vitalock/ui';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@vitalock/ui';
import { useMutateUnit } from '@/hooks/useMutateUnit';
import { toastMutationError } from '@/hooks/mapMutationError';

const schema = z.object({
  number: z.string().min(1, 'El número es obligatorio'),
  unit_type: z.string().optional().nullable(),
  is_administrative: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

const UNIT_TYPE_OPTIONS = [
  { value: 'apartment', label: 'Departamento' },
  { value: 'office', label: 'Oficina' },
  { value: 'commercial', label: 'Local comercial' },
  { value: 'garage', label: 'Cochera' },
  { value: 'storage', label: 'Depósito' },
  { value: 'common', label: 'Área común' },
];

interface QuickUnitCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buildingId: string;
  onCreated: (unitId: string) => void;
}

export function QuickUnitCreateDialog({
  open,
  onOpenChange,
  buildingId,
  onCreated,
}: QuickUnitCreateDialogProps) {
  const { createUnit } = useMutateUnit(buildingId);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      number: '',
      unit_type: null,
      is_administrative: false,
    },
  });

  const onSubmit = async (values: FormValues) => {
    try {
      const result = await createUnit.mutateAsync({
        building_id: buildingId,
        number: values.number,
        unit_type: values.unit_type ?? null,
        is_administrative: values.is_administrative,
      });
      onCreated(result.id);
      reset();
      onOpenChange(false);
    } catch (err) {
      toastMutationError(err as Error);
    }
  };

  const isPending = createUnit.isPending || isSubmitting;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Nueva unidad</DialogTitle>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            // Portals bubble React events up the virtual tree — stop the
            // submit here so any enclosing parent form doesn't also submit.
            e.stopPropagation();
            void handleSubmit(onSubmit)(e);
          }}
          className="flex flex-col gap-4"
        >
          {/* Number */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="quick-unit-number">Número *</Label>
            <Input
              id="quick-unit-number"
              placeholder="Ej. 1A, 202, PB"
              {...register('number')}
            />
            {errors.number && (
              <p className="text-sm text-destructive">{errors.number.message}</p>
            )}
          </div>

          {/* Unit type */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="quick-unit-type">Tipo</Label>
            <Controller
              control={control}
              name="unit_type"
              render={({ field }) => (
                <Select
                  value={field.value ?? ''}
                  onValueChange={(v) => field.onChange(v || null)}
                >
                  <SelectTrigger id="quick-unit-type">
                    <SelectValue placeholder="Sin especificar" />
                  </SelectTrigger>
                  <SelectContent>
                    {UNIT_TYPE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          {/* Is administrative */}
          <div className="flex items-center gap-3">
            <Controller
              control={control}
              name="is_administrative"
              render={({ field }) => (
                <Switch
                  id="quick-unit-is-admin"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              )}
            />
            <Label htmlFor="quick-unit-is-admin" className="cursor-pointer">
              Unidad administrativa
            </Label>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Creando...' : 'Crear'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
