import { Link, useParams } from 'react-router-dom';
import { Button } from '@vitalock/ui';
import { useOrden } from '@/hooks/useOrden';
import { useMutateOrden } from '@/hooks/useMutateOrden';
import { useOrderTareas } from '@/hooks/useOrderTareas';
import { OrdenStatusBadge } from '@/components/ordenes/OrdenStatusBadge';
import { OrderItemsTable } from '@/components/ordenes/OrderItemsTable';
import { TechnicalItemsTable } from '@/components/ordenes/TechnicalItemsTable';
import { OrderTareasTable } from '@/components/ordenes/OrderTareasTable';

const TERMINAL_STATUSES = new Set(['completed', 'invoiced', 'cancelled']);

export default function OrdenDetailPage() {
  const { ordenId } = useParams<{ ordenId: string }>();
  const { data: orden, isLoading, isError } = useOrden(ordenId);
  const { confirmOrden, cancelOrden, markOrderInvoiced } = useMutateOrden();
  const { data: orderTareas = [], isLoading: tareasLoading } = useOrderTareas(ordenId);

  if (!ordenId) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-lg font-medium text-muted-foreground">ID de orden inválido.</p>
        <Link to="/ordenes" className="mt-4 text-sm underline">
          Volver a órdenes
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

  if (isError || orden == null) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-lg font-medium text-muted-foreground">
          {isError ? 'Error al cargar la orden.' : 'Orden no encontrada.'}
        </p>
        <Link to="/ordenes" className="mt-4 text-sm underline">
          Volver a órdenes
        </Link>
      </div>
    );
  }

  const isTerminal = TERMINAL_STATUSES.has(orden.status);
  const isDraft = orden.status === 'draft';
  const isReadyForPickup = orden.status === 'ready_for_pickup';
  const isCompleted = orden.status === 'completed';
  const isParticular = orden.client_type === 'particular';
  const isKeysOrder = orden.order_type === 'keys';

  const clientLabel =
    orden.client_type === 'administration'
      ? (orden.administrations?.company_name ?? '—')
      : orden.particular_full_name ?? '—';

  const clientDetail =
    orden.client_type === 'particular' && orden.particular_dni
      ? `DNI: ${orden.particular_dni}`
      : null;

  const handleConfirm = () => {
    confirmOrden.mutate({ id: orden.id });
  };

  const handleCancel = () => {
    cancelOrden.mutate({ id: orden.id });
  };

  const handleMarkInvoiced = () => {
    markOrderInvoiced.mutate({ id: orden.id });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
        <Link to="/ordenes" className="hover:text-foreground transition-colors">
          Órdenes
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">{orden.order_number}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{orden.order_number}</h1>
            <OrdenStatusBadge status={orden.status} />
          </div>

          {/* Client info */}
          <div className="flex flex-col gap-0.5">
            {orden.client_type === 'administration' ? (
              orden.administration_id ? (
                <Link
                  to={`/administraciones/${orden.administration_id}`}
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
                {orden.particular_phone && (
                  <p className="text-xs text-muted-foreground">
                    Tel: {orden.particular_phone}
                  </p>
                )}
                {orden.particular_email && (
                  <p className="text-xs text-muted-foreground">{orden.particular_email}</p>
                )}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Creada el{' '}
              {new Date(orden.created_at).toLocaleDateString('es-AR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
              })}
            </p>
          </div>

          {/* Notes */}
          {orden.notes && (
            <p className="mt-2 text-sm text-muted-foreground max-w-lg">{orden.notes}</p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {isDraft && (
            <Button asChild variant="outline">
              <Link to={`/ordenes/${orden.id}/editar`}>Editar</Link>
            </Button>
          )}

          {isDraft && (
            <Button
              onClick={handleConfirm}
              disabled={confirmOrden.isPending}
            >
              {confirmOrden.isPending ? 'Confirmando...' : 'Confirmar orden'}
            </Button>
          )}

          {isCompleted && (
            <Button
              onClick={handleMarkInvoiced}
              disabled={markOrderInvoiced.isPending}
            >
              {markOrderInvoiced.isPending ? 'Marcando...' : 'Marcar facturada'}
            </Button>
          )}

          {!isTerminal && (
            <Button
              variant="destructive"
              onClick={handleCancel}
              disabled={cancelOrden.isPending}
            >
              {cancelOrden.isPending ? 'Cancelando...' : 'Cancelar orden'}
            </Button>
          )}
        </div>
      </div>

      {isKeysOrder ? (
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Ítems</h2>
          <OrderItemsTable
            items={orden.order_items}
            orderId={orden.id}
            orderStatus={orden.status}
            canRegisterPickup={isParticular && isReadyForPickup}
            buyer={orden.particulares}
            isFetching={isLoading}
          />
        </div>
      ) : (
        <>
          {/* Technical items: minimal read-only table (no key-specific actions). */}
          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Ítems</h2>
            <TechnicalItemsTable items={orden.order_items} isFetching={isLoading} />
          </div>

          {/* Linked tickets/tareas */}
          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Tareas</h2>
            <OrderTareasTable tareas={orderTareas} isFetching={tareasLoading} />
          </div>
        </>
      )}
    </div>
  );
}
