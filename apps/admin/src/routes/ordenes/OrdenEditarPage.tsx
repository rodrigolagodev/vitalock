import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { OrdenForm } from '@/components/ordenes/OrdenForm';
import type { OrdenFormValues } from '@/components/ordenes/OrdenForm';
import { useOrden } from '@/hooks/useOrden';
import { useMutateOrden } from '@/hooks/useMutateOrden';
import { toastMutationError } from '@/hooks/mapMutationError';

export default function OrdenEditarPage() {
  const { ordenId } = useParams<{ ordenId: string }>();
  const navigate = useNavigate();
  const { data: orden, isLoading, isError } = useOrden(ordenId);
  const { updateDraftOrden } = useMutateOrden();

  // Redirect non-draft orders to their detail page.
  useEffect(() => {
    if (orden && orden.status !== 'draft') {
      toast.warning('Solo se pueden editar órdenes en borrador.');
      navigate(`/ordenes/${orden.id}`, { replace: true });
    }
  }, [orden, navigate]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 pb-24">
        <div
          role="status"
          aria-label="Cargando orden"
          className="animate-pulse flex flex-col gap-4"
        >
          <div className="h-6 w-48 rounded bg-muted" />
          <div className="h-48 rounded bg-muted" />
          <div className="h-48 rounded bg-muted" />
        </div>
      </div>
    );
  }

  if (isError || !orden) {
    return (
      <div className="flex flex-col gap-6 pb-24">
        <p className="text-destructive">Error al cargar la orden.</p>
      </div>
    );
  }

  // While the redirect effect fires, render nothing to avoid a flash.
  if (orden.status !== 'draft') {
    return null;
  }

  // Build initialValues from the existing orden data.
  const initialValues: OrdenFormValues = {
    order_type: orden.order_type,
    client_type: orden.client_type,
    administration_id: orden.administration_id ?? null,
    particular_id: orden.particular_id ?? null,
    particular_full_name: orden.particular_full_name ?? '',
    particular_dni: orden.particular_dni ?? '',
    particular_phone: orden.particular_phone ?? '',
    particular_email: orden.particular_email ?? '',
    notes: orden.notes ?? '',
    items: orden.order_items.map((item) => ({
      item_type: item.item_type,
      quantity: item.quantity,
      description: item.description ?? '',
      building_id: item.building_id ?? null,
      unit_price: item.unit_price ?? null,
      unit_id: item.unit_id ?? null,
      pickup_particular_id: item.pickup_particular_id ?? null,
      pickup_same_as_particular: false,
      product_id: item.product_id ?? null,
      // Carry the existing item id so the RPC can UPDATE rather than INSERT.
      _id: item.id,
    })),
  };

  const handleSubmit = async (values: OrdenFormValues) => {
    try {
      await updateDraftOrden.mutateAsync({
        id: orden.id,
        expectedUpdatedAt: orden.updated_at,
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
        },
        items: values.items.map((item, idx) => ({
          // Preserve existing item ids so the RPC can UPDATE by id.
          id: (initialValues.items[idx] as unknown as { _id?: string })?._id ?? undefined,
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
      navigate(`/ordenes/${orden.id}`);
    } catch (err) {
      // Optimistic concurrency error: specific toast, stay on edit page.
      const error = err as Error & { message?: string };
      if (error?.message?.includes('ORDERS_UPDATE_CONFLICT')) {
        toast.warning('La orden cambió — recargá la página.');
      } else {
        toastMutationError(err as Error);
      }
    }
  };

  const handleCancel = () => {
    navigate(`/ordenes/${orden.id}`);
  };

  return (
    <div className="flex flex-col gap-6 pb-24">
      <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
        <Link to="/ordenes" className="hover:text-foreground transition-colors">
          Órdenes
        </Link>
        <span>/</span>
        <Link
          to={`/ordenes/${orden.id}`}
          className="hover:text-foreground transition-colors"
        >
          {orden.order_number}
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">Editar</span>
      </div>

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Editar orden</h1>
        <p className="text-sm text-muted-foreground">
          Modificá el tipo, el cliente o los ítems del borrador.
        </p>
      </div>

      <OrdenForm
        mode="edit"
        initialValues={initialValues}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        isPending={updateDraftOrden.isPending}
      />
    </div>
  );
}
