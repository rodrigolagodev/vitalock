import { createStatusHelpers } from '@vitalock/ui';

/** Physical key lifecycle status (the RFID key itself). */
export type KeyStatus =
  | 'pending_creation'
  | 'pending_installation'
  | 'active'
  | 'pending_disable'
  | 'disabled';

export const keyStatus = createStatusHelpers<KeyStatus>({
  pending_creation: { label: 'En creación', tone: 'neutral' },
  pending_installation: { label: 'Pendiente de instalación', tone: 'warning' },
  active: { label: 'Activa', tone: 'success' },
  pending_disable: { label: 'Baja solicitada', tone: 'warning' },
  disabled: { label: 'Dada de baja', tone: 'danger' },
});
