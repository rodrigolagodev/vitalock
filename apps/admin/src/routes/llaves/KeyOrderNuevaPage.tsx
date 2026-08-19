import { Link, useNavigate } from 'react-router-dom';
import { KeyOrderForm } from '@/components/llaves/KeyOrderForm';
import type { KeyOrderFormValues } from '@/components/llaves/KeyOrderForm';
import { useMutateKeyOrder } from '@/hooks/useMutateKeyOrder';
import { toastMutationError } from '@/hooks/mapMutationError';

export default function KeyOrderNuevaPage() {
  const navigate = useNavigate();
  const { createKeyOrder } = useMutateKeyOrder();

  const handleSubmit = async (values: KeyOrderFormValues) => {
    try {
      const newId = await createKeyOrder.mutateAsync({
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
          item_type: 'key' as const,
          quantity: item.quantity,
          description: item.description || null,
          building_id: item.building_id ?? '',
          unit_price: item.unit_price ?? 0,
          unit_id: item.unit_id ?? null,
          pickup_particular_id: item.pickup_particular_id ?? null,
          product_id: item.product_id ?? null,
        })),
        confirmImmediately: true,
      });
      navigate(`/llaves/${newId}`);
    } catch (err) {
      toastMutationError(err as Error);
    }
  };

  const handleCancel = () => {
    navigate('/llaves');
  };

  return (
    <div className="flex flex-col gap-6 pb-24">
      <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
        <Link to="/llaves" className="hover:text-foreground transition-colors">
          Llaves
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">Nueva orden</span>
      </div>

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Nueva orden de llaves</h1>
        <p className="text-sm text-muted-foreground">
          Completá los datos del cliente y las llaves. La orden se confirma automáticamente al guardar.
        </p>
      </div>

      <KeyOrderForm
        mode="create"
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        isPending={createKeyOrder.isPending}
      />
    </div>
  );
}
