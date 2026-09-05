import { createStatusHelpers } from '@vitalock/ui';

/** Physical equipment lifecycle status. */
export type EquipmentStatus = 'active' | 'maintenance' | 'dead';

export const equipmentStatus = createStatusHelpers<EquipmentStatus>({
  active: { label: 'Activo', tone: 'success' },
  maintenance: { label: 'Mantenimiento', tone: 'warning' },
  dead: { label: 'Dado de baja', tone: 'danger' },
});
