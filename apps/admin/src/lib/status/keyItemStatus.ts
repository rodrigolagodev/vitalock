import { createStatusHelpers } from '@vitalock/ui';

/** Status of a single line item within a key order. */
export type KeyItemStatus = 'pending' | 'configured' | 'installed' | 'cancelled';

export const keyItemStatus = createStatusHelpers<KeyItemStatus>({
  pending: { label: 'Pendiente', tone: 'neutral' },
  configured: { label: 'Configurada', tone: 'brand' },
  installed: { label: 'Instalada', tone: 'info' },
  cancelled: { label: 'Cancelada', tone: 'danger' },
});
