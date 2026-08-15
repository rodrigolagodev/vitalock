import { Link, useNavigate } from 'react-router-dom';
import { OrdenForm } from '@/components/ordenes/OrdenForm';
import type { OrdenFormValues } from '@/components/ordenes/OrdenForm';
import { useMutateOrden } from '@/hooks/useMutateOrden';
import { toastMutationError } from '@/hooks/mapMutationError';

export default function OrdenNuevaPage() {
  const navigate = useNavigate();
  const { createOrden } = useMutateOrden();

  const handleSubmit = async (values: OrdenFormValues) => {
    try {
      const newId = await createOrden.mutateAsync({
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
          unit_price: item.unit_price ?? null,
          unit_id: item.unit_id ?? null,
          pickup_particular_id: item.pickup_particular_id ?? null,
          product_id: item.product_id ?? null,
        })),
      });
      navigate(`/ordenes/${newId}`);
    } catch (err) {
      toastMutationError(err as Error);
    }
  };

  const handleCancel = () => {
    navigate('/ordenes');
  };

  return (
    <div className="flex flex-col gap-6 pb-24">
      <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
        <Link to="/ordenes" className="hover:text-foreground transition-colors">
          Órdenes
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">Nueva orden</span>
      </div>

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Nueva orden</h1>
        <p className="text-sm text-muted-foreground">
          Configurá el tipo, el cliente y los ítems de la orden.
        </p>
      </div>

      <OrdenForm
        mode="create"
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        isPending={createOrden.isPending}
      />
    </div>
  );
}
