import type { StatusTone } from '@vitalock/ui';

/** Key order status. Labels are FEMININE because they qualify "la orden". */
export type KeyOrderStatus =
  | 'draft'
  | 'confirmed'
  | 'in_progress'
  | 'pending_installation'
  | 'ready_for_pickup'
  | 'completed'
  | 'invoiced'
  | 'cancelled';

const KEY_ORDER_STATUS_META: Record<KeyOrderStatus, { label: string; tone: StatusTone }> = {
  draft: { label: 'Borrador', tone: 'neutral' },
  confirmed: { label: 'Confirmada', tone: 'brand' },
  in_progress: { label: 'En proceso', tone: 'warning' },
  pending_installation: { label: 'Pendiente de instalación', tone: 'warning' },
  ready_for_pickup: { label: 'Lista para retirar', tone: 'info' },
  completed: { label: 'Completada', tone: 'success' },
  invoiced: { label: 'Facturada', tone: 'neutral' },
  cancelled: { label: 'Cancelada', tone: 'danger' },
};

export function keyOrderStatusLabel(status: string | null | undefined): string {
  if (status == null) return '—';
  return KEY_ORDER_STATUS_META[status as KeyOrderStatus]?.label ?? status;
}

export function keyOrderStatusTone(status: string | null | undefined): StatusTone {
  return KEY_ORDER_STATUS_META[status as KeyOrderStatus]?.tone ?? 'neutral';
}
