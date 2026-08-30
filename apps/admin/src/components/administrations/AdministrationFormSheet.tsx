import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@vitalock/ui';
import { Button } from '@vitalock/ui';
import { Input } from '@vitalock/ui';
import { Label } from '@vitalock/ui';
import { Textarea } from '@vitalock/ui';
import { useMutateAdministration } from '@/hooks/useMutateAdministration';
import type { AdministrationRow } from '@/hooks/useAdministrations';

const schema = z.object({
  company_name: z.string().min(1, 'La razón social es obligatoria'),
  tax_id: z.string().optional(),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  phone: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface AdministrationFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  administration?: AdministrationRow | null;
}

export function AdministrationFormSheet({
  open,
  onOpenChange,
  administration,
}: AdministrationFormSheetProps) {
  const isEdit = Boolean(administration);
  const { createAdministration, updateAdministration } = useMutateAdministration();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      company_name: '',
      tax_id: '',
      email: '',
      phone: '',
      address: '',
      notes: '',
    },
  });

  useEffect(() => {
    if (open) {
      reset({
        company_name: administration?.company_name ?? '',
        tax_id: administration?.tax_id ?? '',
        email: administration?.email ?? '',
        phone: administration?.phone ?? '',
        address: administration?.address ?? '',
        notes: administration?.notes ?? '',
      });
    }
  }, [open, administration, reset]);

  const onSubmit = async (values: FormValues) => {
    if (isEdit && administration) {
      await updateAdministration.mutateAsync({
        id: administration.id,
        company_name: values.company_name,
        tax_id: values.tax_id || null,
        email: values.email || null,
        phone: values.phone || null,
        address: values.address || null,
        notes: values.notes || null,
      });
    } else {
      await createAdministration.mutateAsync({
        company_name: values.company_name,
        tax_id: values.tax_id || null,
        email: values.email || null,
        phone: values.phone || null,
        address: values.address || null,
        notes: values.notes || null,
      });
    }
    onOpenChange(false);
  };

  const isPending = createAdministration.isPending || updateAdministration.isPending;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col gap-0 sm:max-w-md">
        <SheetHeader className="p-6 pb-4">
          <SheetTitle>
            {isEdit ? 'Editar administración' : 'Nueva administración'}
          </SheetTitle>
        </SheetHeader>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-1 flex-col gap-6 overflow-y-auto px-6"
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="company_name">Razón social *</Label>
            <Input
              id="company_name"
              {...register('company_name')}
              placeholder="Ej. Administraciones García S.A."
            />
            {errors.company_name && (
              <p className="text-sm text-destructive">{errors.company_name.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="tax_id">CUIT/CUIL</Label>
            <Input
              id="tax_id"
              {...register('tax_id')}
              placeholder="Ej. 30-71234567-9"
            />
            {errors.tax_id && (
              <p className="text-sm text-destructive">{errors.tax_id.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              {...register('email')}
              placeholder="Ej. contacto@admin.com"
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
            {errors.phone && (
              <p className="text-sm text-destructive">{errors.phone.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="address">Dirección</Label>
            <Input
              id="address"
              {...register('address')}
              placeholder="Ej. Av. Corrientes 1234, CABA"
            />
            {errors.address && (
              <p className="text-sm text-destructive">{errors.address.message}</p>
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
            {errors.notes && (
              <p className="text-sm text-destructive">{errors.notes.message}</p>
            )}
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
