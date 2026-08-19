import { StatusBadge, type StatusTone } from '@vitalock/ui';
import type { TechnicalOrderStatus } from '@/hooks/useTechnicalOrders';

// spec #220: technical_orders status domain is 6 values — ready_for_pickup MUST NOT appear.
const STATUS_LABELS: Record<TechnicalOrderStatus, string> = {
  draft: 'Borrador',
  confirmed: 'Confirmada',
  in_progress: 'En proceso',
  completed: 'Completado',
  invoiced: 'Facturado',
  cancelled: 'Cancelado',
};

const STATUS_TONES: Record<TechnicalOrderStatus, StatusTone> = {
  draft: 'neutral',
  confirmed: 'brand',
  in_progress: 'warning',
  completed: 'success',
  invoiced: 'neutral',
  cancelled: 'danger',
};

interface TechnicalOrderStatusBadgeProps {
  status: TechnicalOrderStatus;
}

export function TechnicalOrderStatusBadge({ status }: TechnicalOrderStatusBadgeProps) {
  return (
    <StatusBadge tone={STATUS_TONES[status]}>
      {STATUS_LABELS[status]}
    </StatusBadge>
  );
}
