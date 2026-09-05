import type { StatusTone } from '@vitalock/ui';

/** Status of a single line item within a key order. */
type KeyItemStatus = 'pending' | 'configured' | 'installed' | 'cancelled';

const KEY_ITEM_STATUS_META: Record<KeyItemStatus, { label: string; tone: StatusTone }> = {
  pending: { label: 'Pendiente', tone: 'neutral' },
  configured: { label: 'Configurada', tone: 'brand' },
  installed: { label: 'Instalada', tone: 'info' },
  cancelled: { label: 'Cancelada', tone: 'danger' },
};

export function keyItemStatusLabel(status: string | null | undefined): string {
  if (status == null) return '—';
  return KEY_ITEM_STATUS_META[status as KeyItemStatus]?.label ?? status;
}

export function keyItemStatusTone(status: string | null | undefined): StatusTone {
  return KEY_ITEM_STATUS_META[status as KeyItemStatus]?.tone ?? 'neutral';
}
