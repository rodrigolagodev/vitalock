import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@vitalock/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { KeyOrderForm } from '@/components/llaves/KeyOrderForm';
import type { KeyOrderFormValues } from '@/components/llaves/KeyOrderForm';
import { useKeyOrder } from '@/hooks/useKeyOrder';
import { useMutateKeyOrder } from '@/hooks/useMutateKeyOrder';
import { toastMutationError } from '@/lib/errors/toast';

export default function KeyOrderEditarPage() {
  const { keyOrderId } = useParams<{ keyOrderId: string }>();
  const navigate = useNavigate();
  const { data: order, isLoading, isError } = useKeyOrder(keyOrderId);
  const { updateDraftKeyOrder } = useMutateKeyOrder();

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

  if (isError || !order) {
    return (
      <div className="flex flex-col gap-6 pb-24">
        <p className="text-destructive">Error al cargar la orden.</p>
      </div>
    );
  }

  // Draft-only guard: key orders can only be edited in draft status.
  if (order.status !== 'draft') {
    return (
      <div className="flex flex-col gap-6 pb-24">
        <PageHeader
          title="Editar orden de llaves"
          breadcrumbs={[
            { label: 'Llaves', to: '/llaves' },
            { label: order.order_number, to: `/llaves/${order.id}` },
            { label: 'Editar' },
          ]}
        />

        <div className="flex flex-col gap-4 rounded-md border border-destructive/30 bg-destructive/5 p-5">
          <p className="text-sm text-destructive font-medium">
            Esta orden no puede editarse porque no está en estado borrador.
          </p>
          <p className="text-sm text-muted-foreground">
            Solo las órdenes en estado <strong>borrador</strong> pueden modificarse. El estado
            actual de esta orden es <strong>{order.status}</strong>.
          </p>
          <Button
            variant="outline"
            onClick={() => navigate(`/llaves/${order.id}`)}
          >
            Volver al detalle
          </Button>
        </div>
      </div>
    );
  }

  const handleSubmit = async (values: KeyOrderFormValues) => {
    if (!order) return;
    try {
      await updateDraftKeyOrder.mutateAsync({
        id: order.id,
        expectedUpdatedAt: order.updated_at,
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
        items: values.items.map((item, idx) => ({
          // Preserve existing item id so the RPC can UPDATE by id.
          id: (order.key_order_items[idx] as { id?: string } | undefined)?.id ?? undefined,
          item_type: 'key' as const,
          quantity: item.quantity,
          description: item.description || null,
          building_id: item.building_id ?? '',
          unit_price: item.unit_price ?? 0,
          unit_id: item.unit_id ?? null,
          pickup_particular_id: item.pickup_particular_id ?? null,
          product_id: item.product_id ?? null,
        })),
      });
      navigate(`/llaves/${order.id}`);
    } catch (err) {
      const error = err as Error & { message?: string };
      if (error?.message?.includes('KEY_ORDER_STALE')) {
        toast.warning('La orden cambió desde que abriste esta pantalla — recargá la página.');
      } else {
        toastMutationError(err as Error);
      }
    }
  };

  const handleCancel = () => {
    navigate(`/llaves/${order.id}`);
  };

  return (
    <div className="flex flex-col gap-6 pb-24">
      <PageHeader
        title="Editar orden de llaves"
        subtitle="Modificá el cliente o los items del borrador."
        breadcrumbs={[
          { label: 'Llaves', to: '/llaves' },
          { label: order.order_number, to: `/llaves/${order.id}` },
          { label: 'Editar' },
        ]}
      />

      <KeyOrderForm
        mode="edit"
        initialOrder={order}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        isPending={updateDraftKeyOrder.isPending}
      />
    </div>
  );
}
