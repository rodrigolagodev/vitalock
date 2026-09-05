import { createStatusHelpers } from '@vitalock/ui';

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

export const keyOrderStatus = createStatusHelpers<KeyOrderStatus>({
  draft: { label: 'Borrador', tone: 'neutral' },
  confirmed: { label: 'Confirmada', tone: 'brand' },
  in_progress: { label: 'En proceso', tone: 'warning' },
  pending_installation: { label: 'Pendiente de instalación', tone: 'warning' },
  ready_for_pickup: { label: 'Lista para retirar', tone: 'info' },
  completed: { label: 'Completada', tone: 'success' },
  invoiced: { label: 'Facturada', tone: 'neutral' },
  cancelled: { label: 'Cancelada', tone: 'danger' },
});
