import { StatusBadge, type StatusTone } from '@vitalock/ui';
import type { OrderStatus } from '@/hooks/useOrdens';

const STATUS_LABELS: Record<OrderStatus, string> = {
  draft: 'Borrador',
  confirmed: 'Confirmada',
  ready_for_pickup: 'Listo para retirar',
  in_progress: 'En proceso',
  completed: 'Completado',
  invoiced: 'Facturado',
  cancelled: 'Cancelado',
};

const STATUS_TONES: Record<OrderStatus, StatusTone> = {
  draft: 'neutral',
  confirmed: 'brand',
  ready_for_pickup: 'info',
  in_progress: 'warning',
  completed: 'success',
  invoiced: 'neutral',
  cancelled: 'danger',
};

interface OrdenStatusBadgeProps {
  status: OrderStatus;
}

export function OrdenStatusBadge({ status }: OrdenStatusBadgeProps) {
  return (
    <StatusBadge tone={STATUS_TONES[status]}>
      {STATUS_LABELS[status]}
    </StatusBadge>
  );
}
