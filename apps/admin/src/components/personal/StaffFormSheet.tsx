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
import { Button } from '@vitalock/ui';
import { Input } from '@vitalock/ui';
import { Label } from '@/components/ui/label';
import { Textarea } from '@vitalock/ui';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useMutateStaff } from '@/hooks/useMutateStaff';
import { toastMutationError } from '@/hooks/mapMutationError';
import type { StaffRole } from '@/hooks/useMutateStaff';
import type { StaffRow } from '@/hooks/usePersonal';

// ---- Zod schema ----

const schema = z
  .object({
    full_name: z.string().min(1, 'El nombre es obligatorio'),
    email: z.string().email('Email inválido').optional().or(z.literal('')),
    phone: z.string().optional(),
    role: z.string().optional(),
    notes: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.role) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Seleccioná un rol',
        path: ['role'],
      });
    }
  });

type FormValues = z.infer<typeof schema>;

// ---- Labels ----

const ROLE_LABELS: Record<StaffRole, string> = {
  admin: 'Admin',
  installer: 'Instalador',
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

interface StaffFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staff?: StaffRow | null;
}

export function StaffFormSheet({ open, onOpenChange, staff }: StaffFormSheetProps) {
  const isEdit = Boolean(staff);
  const { createStaff, updateStaff } = useMutateStaff();

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      full_name: '',
      email: '',
      phone: '',
      role: '',
      notes: '',
    },
  });

  useEffect(() => {
    if (open) {
      reset({
        full_name: staff?.full_name ?? '',
        email: staff?.email ?? '',
        phone: staff?.phone ?? '',
        role: staff?.role ?? '',
        notes: staff?.notes ?? '',
      });
    }
  }, [open, staff, reset]);

  const onSubmit = async (values: FormValues) => {
    try {
      if (isEdit && staff) {
        await updateStaff.mutateAsync({
          id: staff.id,
          full_name: values.full_name,
          email: values.email || null,
          phone: values.phone || null,
          role: values.role as StaffRole,
          notes: values.notes || null,
        });
      } else {
        await createStaff.mutateAsync({
          full_name: values.full_name,
          email: values.email || null,
          phone: values.phone || null,
          role: values.role as StaffRole,
          notes: values.notes || null,
        });
      }
      onOpenChange(false);
    } catch (err) {
      toastMutationError(err as Error);
    }
  };

  const isPending = createStaff.isPending || updateStaff.isPending;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col gap-0 sm:max-w-md">
        <SheetHeader className="p-6 pb-4">
          <SheetTitle>{isEdit ? 'Editar personal' : 'Nuevo personal'}</SheetTitle>
        </SheetHeader>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-1 flex-col gap-6 overflow-y-auto px-6"
        >
          {isEdit && staff && (
            <div className="flex flex-col gap-2 rounded-md border p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Alta</span>
                <span className="font-medium">{formatDate(staff.created_at)}</span>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="full_name">Nombre *</Label>
            <Input
              id="full_name"
              {...register('full_name')}
              placeholder="Ej. Juan Pérez"
            />
            {errors.full_name && (
              <p className="text-sm text-destructive">{errors.full_name.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              {...register('email')}
              placeholder="Ej. juan@vitalock.com"
            />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="phone">Teléfono</Label>
            <Input
              id="phone"
              {...register('phone')}
              placeholder="Ej. +54 11 1234-5678"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="role">Rol *</Label>
            <Controller
              control={control}
              name="role"
              render={({ field }) => (
                <Select value={field.value ?? ''} onValueChange={field.onChange}>
                  <SelectTrigger id="role">
                    <SelectValue placeholder="Seleccioná un rol" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ROLE_LABELS).map(([val, label]) => (
                      <SelectItem key={val} value={val}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.role && (
              <p className="text-sm text-destructive">{errors.role.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="notes">Notas</Label>
            <Textarea
              id="notes"
              {...register('notes')}
              placeholder="Observaciones adicionales..."
              rows={3}
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
