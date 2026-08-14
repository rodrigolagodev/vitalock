import { Badge } from '@vitalock/ui';
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

const STATUS_STYLES: Record<OrderStatus, string> = {
  draft: 'border-transparent bg-[#f1f5f9] text-[#475569]',
  confirmed: 'border-transparent bg-[#e0e7ff] text-[#4338ca]',
  ready_for_pickup: 'border-transparent bg-[#dbeafe] text-[#1d4ed8]',
  in_progress: 'border-transparent bg-[#fef3c7] text-[#92400e]',
  completed: 'border-transparent bg-[rgba(209,250,229,0.5)] text-[#059691]',
  invoiced: 'border-transparent bg-[#f1f5f9] text-[#475569]',
  cancelled: 'border-transparent bg-[#fee2e2] text-[#b91c1c]',
};

interface OrdenStatusBadgeProps {
  status: OrderStatus;
}

export function OrdenStatusBadge({ status }: OrdenStatusBadgeProps) {
  return (
    <Badge className={`text-[16px] ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}
