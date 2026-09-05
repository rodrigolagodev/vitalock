import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, ConfirmDialog } from '@vitalock/ui';
import { ErrorState, NotFoundState, SectionHeading, Skeleton } from '@vitalock/ui';
import { formatDate } from '@/lib/format';
import { PageHeader } from '@/components/layout/PageHeader';
import { useKeyOrder } from '@/hooks/useKeyOrder';
import { useMutateKeyOrder } from '@/hooks/useMutateKeyOrder';
import { keyOrderStatus } from '@/lib/status/keyOrderStatus';
import { KeyOrderItemsTable } from '@/components/llaves/KeyOrderItemsTable';

function isTerminalOrder(status: string): boolean {
  return status === 'invoiced' || status === 'cancelled';
}

export default function KeyOrderDetailPage() {
  const { keyOrderId } = useParams<{ keyOrderId: string }>();
  const { data: order, isLoading, isError } = useKeyOrder(keyOrderId);
  const { cancelKeyOrder, markKeyOrderInvoiced } = useMutateKeyOrder();
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);

  if (!keyOrderId) {
    return (
      <ErrorState
        message="ID de orden inválido."
        back={{ label: 'Volver a llaves', to: '/llaves' }}
        className="py-24"
      />
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (isError || order == null) {
    return isError ? (
      <ErrorState
        message="Error al cargar la orden."
        back={{ label: 'Volver a llaves', to: '/llaves' }}
        className="py-24"
      />
    ) : (
      <NotFoundState
        message="Orden no encontrada."
        back={{ label: 'Volver a llaves', to: '/llaves' }}
      />
    );
  }

  const isTerminal = isTerminalOrder(order.status);
  const isDraft = order.status === 'draft';
  const isCompleted = order.status === 'completed';
  const isReadyForPickup = order.status === 'ready_for_pickup';

  const clientLabel =
    order.client_type === 'administration'
      ? (order.administrations?.company_name ?? '—')
      : (order.particular_full_name ?? '—');

  const clientDetail =
    order.client_type === 'particular' && order.particular_dni
      ? `DNI: ${order.particular_dni}`
      : null;

  const handleCancel = () => {
    cancelKeyOrder.mutate(
      { id: order.id },
      {
        onSettled: () => setCancelConfirmOpen(false),
      },
    );
  };

  const handleMarkInvoiced = () => {
    markKeyOrderInvoiced.mutate({ id: order.id });
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={order.order_number}
        breadcrumbs={[{ label: 'Llaves', to: '/llaves' }, { label: order.order_number }]}
        titleAdornment={<keyOrderStatus.Badge status={order.status} />}
        subtitle={
          <div className="flex flex-col gap-0.5">
            {order.client_type === 'administration' ? (
              order.administration_id ? (
                <Link
                  to={`/administraciones/${order.administration_id}`}
                  className="hover:text-foreground underline-offset-4 transition-colors hover:underline"
                >
                  {clientLabel}
                </Link>
              ) : (
                <span>{clientLabel}</span>
              )
            ) : (
              <>
                <span className="font-medium">{clientLabel}</span>
                {clientDetail && <span className="text-xs">{clientDetail}</span>}
                {order.particular_phone && (
                  <span className="text-xs">Tel: {order.particular_phone}</span>
                )}
                {order.particular_email && (
                  <span className="text-xs">{order.particular_email}</span>
                )}
              </>
            )}
            <span className="text-xs">Creada el {formatDate(order.created_at)}</span>
            {order.notes && <span className="mt-2 max-w-lg">{order.notes}</span>}
          </div>
        }
      >
        {isDraft && (
          <Button asChild variant="outline">
            <Link to={`/llaves/${order.id}/editar`}>Editar</Link>
          </Button>
        )}
        {isCompleted && (
          <Button onClick={handleMarkInvoiced} disabled={markKeyOrderInvoiced.isPending}>
            {markKeyOrderInvoiced.isPending ? 'Marcando...' : 'Marcar facturada'}
          </Button>
        )}
        {!isTerminal && (
          <Button
            variant="destructive"
            onClick={() => setCancelConfirmOpen(true)}
            disabled={cancelKeyOrder.isPending}
          >
            {cancelKeyOrder.isPending ? 'Cancelando...' : 'Cancelar orden'}
          </Button>
        )}
      </PageHeader>

      {/* Items table */}
      <div className="flex flex-col gap-3">
        <SectionHeading title="Ítems" variant="secondary" />
        <KeyOrderItemsTable
          items={order.key_order_items}
          orderId={order.id}
          orderStatus={order.status}
          canRegisterPickup={!isTerminal && isReadyForPickup}
          buyer={order.particulares}
          isFetching={isLoading}
        />
      </div>

      <ConfirmDialog
        open={cancelConfirmOpen}
        onOpenChange={setCancelConfirmOpen}
        title={`Cancelar orden ${order.order_number}`}
        description="Esta acción marca la orden como cancelada. No se puede revertir. Los ítems configurados quedarán inertes."
        confirmLabel="Sí, cancelar orden"
        cancelLabel="Volver"
        variant="destructive"
        isPending={cancelKeyOrder.isPending}
        onConfirm={handleCancel}
      />
    </div>
  );
}
