import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@vitalock/ui';
import { TechnicalOrderForm } from '@/components/servicio-tecnico/TechnicalOrderForm';
import type { TechnicalOrderFormValues } from '@/components/servicio-tecnico/TechnicalOrderForm';
import { useTechnicalOrder } from '@/hooks/useTechnicalOrder';
import { useMutateTechnicalOrder } from '@/hooks/useMutateTechnicalOrder';
import { toastMutationError } from '@/hooks/mapMutationError';

export default function TechnicalOrderEditarPage() {
  const { techOrderId } = useParams<{ techOrderId: string }>();
  const navigate = useNavigate();
  const { data: order, isLoading, isError } = useTechnicalOrder(techOrderId);
  const { updateDraftTechnicalOrder } = useMutateTechnicalOrder();

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

  // Draft-only guard: technical orders can only be edited in draft status.
  if (order.status !== 'draft') {
    return (
      <div className="flex flex-col gap-6 pb-24">
        <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
          <Link to="/servicio-tecnico" className="hover:text-foreground transition-colors">
            Servicio técnico
          </Link>
          <span>/</span>
          <Link
            to={`/servicio-tecnico/${order.id}`}
            className="hover:text-foreground transition-colors"
          >
            {order.order_number}
          </Link>
          <span>/</span>
          <span className="text-foreground font-medium">Editar</span>
        </div>

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
            onClick={() => navigate(`/servicio-tecnico/${order.id}`)}
          >
            Volver al detalle
          </Button>
        </div>
      </div>
    );
  }

  const handleSubmit = async (values: TechnicalOrderFormValues) => {
    if (!order) return;
    try {
      await updateDraftTechnicalOrder.mutateAsync({
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
          id: (order.technical_order_items[idx] as { id?: string } | undefined)?.id ?? undefined,
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
      });
      navigate(`/servicio-tecnico/${order.id}`);
    } catch (err) {
      const error = err as Error & { message?: string };
      if (error?.message?.includes('TECHNICAL_ORDER_STALE')) {
        toast.warning('La orden cambió desde que abriste esta pantalla — recargá la página.');
      } else {
        toastMutationError(err as Error);
      }
    }
  };

  const handleCancel = () => {
    navigate(`/servicio-tecnico/${order.id}`);
  };

  return (
    <div className="flex flex-col gap-6 pb-24">
      <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
        <Link to="/servicio-tecnico" className="hover:text-foreground transition-colors">
          Servicio técnico
        </Link>
        <span>/</span>
        <Link
          to={`/servicio-tecnico/${order.id}`}
          className="hover:text-foreground transition-colors"
        >
          {order.order_number}
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">Editar</span>
      </div>

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Editar orden de servicio técnico</h1>
        <p className="text-sm text-muted-foreground">
          Modificá el cliente o las líneas de trabajo del borrador.
        </p>
      </div>

      <TechnicalOrderForm
        mode="edit"
        initialOrder={order}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        isPending={updateDraftTechnicalOrder.isPending}
      />
    </div>
  );
}
