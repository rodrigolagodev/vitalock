import type { StatusTone } from '@vitalock/ui';

/** Physical key lifecycle status (the RFID key itself). */
export type KeyStatus =
  | 'pending_creation'
  | 'pending_installation'
  | 'active'
  | 'pending_disable'
  | 'disabled';

const KEY_STATUS_META: Record<KeyStatus, { label: string; tone: StatusTone }> = {
  pending_creation: { label: 'En creación', tone: 'neutral' },
  pending_installation: { label: 'Pendiente de instalación', tone: 'warning' },
  active: { label: 'Activa', tone: 'success' },
  pending_disable: { label: 'Baja solicitada', tone: 'warning' },
  disabled: { label: 'Dada de baja', tone: 'danger' },
};

export function keyStatusLabel(status: string | null | undefined): string {
  if (status == null) return '—';
  return KEY_STATUS_META[status as KeyStatus]?.label ?? status;
}

export function keyStatusTone(status: string | null | undefined): StatusTone {
  return KEY_STATUS_META[status as KeyStatus]?.tone ?? 'neutral';
}
