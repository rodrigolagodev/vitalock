import { StatusBadge, type StatusTone } from '@vitalock/ui';
import type { KeyOrderStatus } from '@/hooks/useKeyOrders';

const STATUS_LABELS: Record<KeyOrderStatus, string> = {
  draft: 'Borrador',
  confirmed: 'Confirmada',
  ready_for_pickup: 'Listo para retirar',
  in_progress: 'En proceso',
  completed: 'Completado',
  invoiced: 'Facturado',
  cancelled: 'Cancelado',
};

const STATUS_TONES: Record<KeyOrderStatus, StatusTone> = {
  draft: 'neutral',
  confirmed: 'brand',
  ready_for_pickup: 'info',
  in_progress: 'warning',
  completed: 'success',
  invoiced: 'neutral',
  cancelled: 'danger',
};

interface KeyOrderStatusBadgeProps {
  status: KeyOrderStatus;
}

export function KeyOrderStatusBadge({ status }: KeyOrderStatusBadgeProps) {
  return (
    <StatusBadge tone={STATUS_TONES[status]}>
      {STATUS_LABELS[status]}
    </StatusBadge>
  );
}
