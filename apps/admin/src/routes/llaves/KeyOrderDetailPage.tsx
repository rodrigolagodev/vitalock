import { Link, useParams } from 'react-router-dom';
import { Button } from '@vitalock/ui';
import { useKeyOrder } from '@/hooks/useKeyOrder';
import { useMutateKeyOrder } from '@/hooks/useMutateKeyOrder';
import { KeyOrderStatusBadge } from '@/components/llaves/KeyOrderStatusBadge';
import { KeyOrderItemsTable } from '@/components/llaves/KeyOrderItemsTable';

const TERMINAL_STATUSES = new Set(['completed', 'invoiced', 'cancelled']);

export default function KeyOrderDetailPage() {
  const { keyOrderId } = useParams<{ keyOrderId: string }>();
  const { data: order, isLoading, isError } = useKeyOrder(keyOrderId);
  const {
    cancelKeyOrder,
    markKeyOrderInvoiced,
  } = useMutateKeyOrder();

  if (!keyOrderId) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-lg font-medium text-muted-foreground">ID de orden inválido.</p>
        <Link to="/llaves" className="mt-4 text-sm underline">
          Volver a llaves
        </Link>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-40 animate-pulse rounded-md bg-muted" />
        <div className="h-10 w-48 animate-pulse rounded-md bg-muted" />
        <div className="h-64 animate-pulse rounded-md bg-muted" />
      </div>
    );
  }

  if (isError || order == null) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-lg font-medium text-muted-foreground">
          {isError ? 'Error al cargar la orden.' : 'Orden no encontrada.'}
        </p>
        <Link to="/llaves" className="mt-4 text-sm underline">
          Volver a llaves
        </Link>
      </div>
    );
  }

  const isTerminal = TERMINAL_STATUSES.has(order.status);
  const isDraft = order.status === 'draft';
  const isCompleted = order.status === 'completed';
  const isReadyForPickup = order.status === 'ready_for_pickup';
  const isParticular = order.client_type === 'particular';

  const clientLabel =
    order.client_type === 'administration'
      ? (order.administrations?.company_name ?? '—')
      : order.particular_full_name ?? '—';

  const clientDetail =
    order.client_type === 'particular' && order.particular_dni
      ? `DNI: ${order.particular_dni}`
      : null;

  const handleCancel = () => {
    cancelKeyOrder.mutate({ id: order.id });
  };

  const handleMarkInvoiced = () => {
    markKeyOrderInvoiced.mutate({ id: order.id });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
        <Link to="/llaves" className="hover:text-foreground transition-colors">
          Llaves
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">{order.order_number}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{order.order_number}</h1>
            <KeyOrderStatusBadge status={order.status} />
          </div>

          {/* Client info */}
          <div className="flex flex-col gap-0.5">
            {order.client_type === 'administration' ? (
              order.administration_id ? (
                <Link
                  to={`/administraciones/${order.administration_id}`}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline"
                >
                  {clientLabel}
                </Link>
              ) : (
                <p className="text-sm text-muted-foreground">{clientLabel}</p>
              )
            ) : (
              <div className="flex flex-col gap-0.5">
                <p className="text-sm font-medium">{clientLabel}</p>
                {clientDetail && (
                  <p className="text-xs text-muted-foreground">{clientDetail}</p>
                )}
                {order.particular_phone && (
                  <p className="text-xs text-muted-foreground">
                    Tel: {order.particular_phone}
                  </p>
                )}
                {order.particular_email && (
                  <p className="text-xs text-muted-foreground">{order.particular_email}</p>
                )}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Creada el{' '}
              {new Date(order.created_at).toLocaleDateString('es-AR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
              })}
            </p>
          </div>

          {/* Notes */}
          {order.notes && (
            <p className="mt-2 text-sm text-muted-foreground max-w-lg">{order.notes}</p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {isDraft && (
            <Button asChild variant="outline">
              <Link to={`/llaves/${order.id}/editar`}>Editar</Link>
            </Button>
          )}

          {isCompleted && (
            <Button
              onClick={handleMarkInvoiced}
              disabled={markKeyOrderInvoiced.isPending}
            >
              {markKeyOrderInvoiced.isPending ? 'Marcando...' : 'Marcar facturada'}
            </Button>
          )}

          {!isTerminal && (
            <Button
              variant="destructive"
              onClick={handleCancel}
              disabled={cancelKeyOrder.isPending}
            >
              {cancelKeyOrder.isPending ? 'Cancelando...' : 'Cancelar orden'}
            </Button>
          )}
        </div>
      </div>

      {/* Items table */}
      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Ítems</h2>
        <KeyOrderItemsTable
          items={order.key_order_items}
          orderId={order.id}
          orderStatus={order.status}
          canRegisterPickup={isParticular && isReadyForPickup}
          buyer={order.particulares}
          isFetching={isLoading}
        />
      </div>
    </div>
  );
}
