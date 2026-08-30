import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, ConfirmDialog } from '@vitalock/ui';
import {
  ErrorState,
  NotFoundState,
  SectionHeading,
  Skeleton,
} from '@vitalock/ui';
import { formatDate } from '@/lib/format';
import { PageHeader } from '@/components/layout/PageHeader';
import { useTechnicalOrder } from '@/hooks/useTechnicalOrder';
import { useMutateTechnicalOrder } from '@/hooks/useMutateTechnicalOrder';
import { useTechnicalOrderTickets } from '@/hooks/useTechnicalOrderTickets';
import { TechnicalOrderStatusBadge } from '@/components/servicio-tecnico/TechnicalOrderStatusBadge';
import { TechnicalOrderItemsTable } from '@/components/servicio-tecnico/TechnicalOrderItemsTable';
import { LinkedTicketsTable } from '@/components/servicio-tecnico/LinkedTicketsTable';

const TERMINAL_STATUSES = new Set(['invoiced', 'cancelled']);

export default function TechnicalOrderDetailPage() {
  const { techOrderId } = useParams<{ techOrderId: string }>();
  const { data: order, isLoading, isError } = useTechnicalOrder(techOrderId);
  const {
    cancelTechnicalOrder,
    markTechnicalOrderInvoiced,
  } = useMutateTechnicalOrder();
  const { data: tickets = [], isLoading: ticketsLoading } = useTechnicalOrderTickets(techOrderId);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);

  if (!techOrderId) {
    return (
      <ErrorState
        message="ID de orden inválido."
        back={{ label: 'Volver a servicio técnico', to: '/servicio-tecnico' }}
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
        back={{ label: 'Volver a servicio técnico', to: '/servicio-tecnico' }}
        className="py-24"
      />
    ) : (
      <NotFoundState
        message="Orden no encontrada."
        back={{ label: 'Volver a servicio técnico', to: '/servicio-tecnico' }}
      />
    );
  }

  const isTerminal = TERMINAL_STATUSES.has(order.status);
  const isDraft = order.status === 'draft';
  const isCompleted = order.status === 'completed';

  const clientLabel =
    order.client_type === 'administration'
      ? (order.administrations?.company_name ?? '—')
      : order.particular_full_name ?? '—';

  const clientDetail =
    order.client_type === 'particular' && order.particular_dni
      ? `DNI: ${order.particular_dni}`
      : null;

  const handleCancel = () => {
    cancelTechnicalOrder.mutate({ id: order.id }, {
      onSettled: () => setCancelConfirmOpen(false),
    });
  };

  const handleMarkInvoiced = () => {
    markTechnicalOrderInvoiced.mutate({ id: order.id });
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={order.order_number}
        breadcrumbs={[
          { label: 'Servicio técnico', to: '/servicio-tecnico' },
          { label: order.order_number },
        ]}
        titleAdornment={<TechnicalOrderStatusBadge status={order.status} />}
        subtitle={
          <div className="flex flex-col gap-0.5">
            {order.client_type === 'administration' ? (
              order.administration_id ? (
                <Link
                  to={`/administraciones/${order.administration_id}`}
                  className="hover:text-foreground transition-colors underline-offset-4 hover:underline"
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
            {order.notes && (
              <span className="mt-2 max-w-lg">{order.notes}</span>
            )}
          </div>
        }
      >
        {isDraft && (
          <Button asChild variant="outline">
            <Link to={`/servicio-tecnico/${order.id}/editar`}>Editar</Link>
          </Button>
        )}
        {isCompleted && (
          <Button
            onClick={handleMarkInvoiced}
            disabled={markTechnicalOrderInvoiced.isPending}
          >
            {markTechnicalOrderInvoiced.isPending ? 'Marcando...' : 'Marcar facturada'}
          </Button>
        )}
        {!isTerminal && (
          <Button
            variant="destructive"
            onClick={() => setCancelConfirmOpen(true)}
            disabled={cancelTechnicalOrder.isPending}
          >
            {cancelTechnicalOrder.isPending ? 'Cancelando...' : 'Cancelar orden'}
          </Button>
        )}
      </PageHeader>

      {/* Items table */}
      <div className="flex flex-col gap-3">
        <SectionHeading title="Ítems" variant="secondary" />
        <TechnicalOrderItemsTable
          items={order.technical_order_items}
          isFetching={isLoading}
        />
      </div>

      {/* Linked tickets */}
      <div className="flex flex-col gap-3">
        <SectionHeading title="Tareas relacionadas" variant="secondary" />
        <LinkedTicketsTable
          tickets={tickets}
          isLoading={ticketsLoading}
        />
      </div>

      <ConfirmDialog
        open={cancelConfirmOpen}
        onOpenChange={setCancelConfirmOpen}
        title={`Cancelar orden ${order.order_number}`}
        description="Esta acción marca la orden como cancelada. No se puede revertir."
        confirmLabel="Sí, cancelar orden"
        cancelLabel="Volver"
        variant="destructive"
        isPending={cancelTechnicalOrder.isPending}
        onConfirm={handleCancel}
      />
    </div>
  );
}
