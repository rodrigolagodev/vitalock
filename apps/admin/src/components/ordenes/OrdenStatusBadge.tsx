import { Badge } from '@/components/ui/badge';
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

const STATUS_VARIANTS: Record<
  OrderStatus,
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  draft: 'secondary',
  confirmed: 'default',
  ready_for_pickup: 'default',
  in_progress: 'default',
  completed: 'secondary',
  invoiced: 'secondary',
  cancelled: 'destructive',
};

interface OrdenStatusBadgeProps {
  status: OrderStatus;
}

export function OrdenStatusBadge({ status }: OrdenStatusBadgeProps) {
  return (
    <Badge variant={STATUS_VARIANTS[status]}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}
