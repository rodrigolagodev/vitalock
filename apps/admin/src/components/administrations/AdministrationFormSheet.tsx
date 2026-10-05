import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter, FormField } from '@vitalock/ui';
import { Button } from '@vitalock/ui';
import { Input } from '@vitalock/ui';
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
          <SheetTitle>{isEdit ? 'Editar administración' : 'Nueva administración'}</SheetTitle>
        </SheetHeader>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-1 flex-col gap-6 overflow-y-auto px-6"
        >
          <FormField label="Razón social *" id="company_name" error={errors.company_name?.message}>
            <Input {...register('company_name')} placeholder="Ej. Administraciones García S.A." />
          </FormField>

          <FormField label="CUIT/CUIL" id="tax_id" error={errors.tax_id?.message}>
            <Input {...register('tax_id')} placeholder="Ej. 30-71234567-9" />
          </FormField>

          <FormField label="Email" id="email" error={errors.email?.message}>
            <Input type="email" {...register('email')} placeholder="Ej. contacto@admin.com" />
          </FormField>

          <FormField label="Teléfono" id="phone" error={errors.phone?.message}>
            <Input {...register('phone')} placeholder="Ej. +54 11 1234-5678" />
          </FormField>

          <FormField label="Dirección" id="address" error={errors.address?.message}>
            <Input {...register('address')} placeholder="Ej. Av. Corrientes 1234, CABA" />
          </FormField>

          <FormField label="Notas" id="notes" error={errors.notes?.message}>
            <Textarea {...register('notes')} placeholder="Observaciones adicionales..." rows={3} />
          </FormField>

          <SheetFooter className="mt-auto pb-6 pt-4">
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
