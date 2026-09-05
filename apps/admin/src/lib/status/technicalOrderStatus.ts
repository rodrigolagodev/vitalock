import type { StatusTone } from '@vitalock/ui';

/**
 * Technical work-order status. Labels qualify "la orden": feminine for the
 * noun-derived states, but "Facturado"/"Cancelado" here follow the existing
 * UI wording (the technical order is referred to neutrally). Kept matching
 * the wrapper that preceded this module.
 */
export type TechnicalOrderStatus =
  | 'draft'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'invoiced'
  | 'cancelled';

const TECHNICAL_ORDER_STATUS_META: Record<
  TechnicalOrderStatus,
  { label: string; tone: StatusTone }
> = {
  draft: { label: 'Borrador', tone: 'neutral' },
  confirmed: { label: 'Confirmada', tone: 'brand' },
  in_progress: { label: 'En proceso', tone: 'warning' },
  completed: { label: 'Lista para facturar', tone: 'success' },
  invoiced: { label: 'Facturado', tone: 'neutral' },
  cancelled: { label: 'Cancelado', tone: 'danger' },
};

export function technicalOrderStatusLabel(status: string | null | undefined): string {
  if (status == null) return '—';
  return TECHNICAL_ORDER_STATUS_META[status as TechnicalOrderStatus]?.label ?? status;
}

export function technicalOrderStatusTone(status: string | null | undefined): StatusTone {
  return TECHNICAL_ORDER_STATUS_META[status as TechnicalOrderStatus]?.tone ?? 'neutral';
}
