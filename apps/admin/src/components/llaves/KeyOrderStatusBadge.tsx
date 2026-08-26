import { StatusBadge, type StatusTone } from '@vitalock/ui';
import type { KeyOrderStatus } from '@/hooks/useKeyOrders';

const STATUS_LABELS: Record<KeyOrderStatus, string> = {
  draft: 'Borrador',
  confirmed: 'Confirmada',
  in_progress: 'En proceso',
  pending_installation: 'Pendiente instalación',
  ready_for_pickup: 'Listo para retirar',
  completed: 'Completado',
  invoiced: 'Facturado',
  cancelled: 'Cancelado',
};

const STATUS_TONES: Record<KeyOrderStatus, StatusTone> = {
  draft: 'neutral',
  confirmed: 'brand',
  in_progress: 'warning',
  pending_installation: 'warning',
  ready_for_pickup: 'info',
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
