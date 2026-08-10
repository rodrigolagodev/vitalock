import { Badge } from '@/components/ui/badge';
import type { OrdenRow } from '@/hooks/useOrdens';

type OrderStatus = OrdenRow['status'];

const STATUS_LABELS: Record<OrderStatus, string> = {
  draft: 'Borrador',
  in_preparation: 'En preparación',
  ready_for_pickup: 'Listo para retirar',
  completed: 'Completado',
  cancelled: 'Cancelado',
};

const STATUS_VARIANTS: Record<
  OrderStatus,
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  draft: 'secondary',
  in_preparation: 'default',
  ready_for_pickup: 'default',
  completed: 'secondary',
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
