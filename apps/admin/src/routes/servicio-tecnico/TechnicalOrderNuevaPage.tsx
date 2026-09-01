import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { TechnicalOrderForm } from '@/components/servicio-tecnico/TechnicalOrderForm';
import type { TechnicalOrderFormValues } from '@/components/servicio-tecnico/TechnicalOrderForm';
import { useMutateTechnicalOrder } from '@/hooks/useMutateTechnicalOrder';
import { toastMutationError } from '@/lib/errors/toast';

export default function TechnicalOrderNuevaPage() {
  const navigate = useNavigate();
  const { createTechnicalOrder } = useMutateTechnicalOrder();

  const handleSubmit = async (values: TechnicalOrderFormValues) => {
    try {
      const newId = await createTechnicalOrder.mutateAsync({
        order: {
          client_type: values.client_type,
          administration_id: values.administration_id ?? null,
          particular_id: values.particular_id ?? null,
          particular_full_name: values.particular_full_name || null,
          particular_dni: values.particular_dni || null,
          particular_phone: values.particular_phone || null,
          particular_email: values.particular_email || null,
          notes: values.notes || null,
        },
        items: values.items.map((item) => ({
          item_type: item.item_type,
          quantity: item.quantity,
          description: item.description || null,
          building_id: item.building_id ?? '',
          unit_price: item.unit_price ?? 0,
          product_id: item.product_id ?? null,
          intended_equipment_id: item.intended_equipment_id ?? null,
          intended_replacement_equipment_id: item.intended_replacement_equipment_id ?? null,
          intended_assignee_staff_id: item.intended_assignee_staff_id ?? null,
        })),
        confirmImmediately: true,
      });
      navigate(`/servicio-tecnico/${newId}`);
    } catch (err) {
      toastMutationError(err as Error);
    }
  };

  const handleCancel = () => {
    navigate('/servicio-tecnico');
  };

  return (
    <div className="flex min-h-full flex-col gap-6">
      <PageHeader
        title="Nueva orden de servicio técnico"
        subtitle="Completá los datos del cliente y las líneas de trabajo. La orden se confirma automáticamente al guardar."
        breadcrumbs={[
          { label: 'Servicio técnico', to: '/servicio-tecnico' },
          { label: 'Nueva orden' },
        ]}
      />

      <TechnicalOrderForm
        mode="create"
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        isPending={createTechnicalOrder.isPending}
      />
    </div>
  );
}
