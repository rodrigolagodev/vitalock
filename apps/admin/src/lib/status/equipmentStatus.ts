import type { StatusTone } from '@vitalock/ui';

/** Physical equipment lifecycle status. */
export type EquipmentStatus = 'active' | 'maintenance' | 'dead';

const EQUIPMENT_STATUS_META: Record<EquipmentStatus, { label: string; tone: StatusTone }> = {
  active: { label: 'Activo', tone: 'success' },
  maintenance: { label: 'Mantenimiento', tone: 'warning' },
  dead: { label: 'Dado de baja', tone: 'danger' },
};

export function equipmentStatusLabel(status: string | null | undefined): string {
  if (status == null) return '—';
  return EQUIPMENT_STATUS_META[status as EquipmentStatus]?.label ?? status;
}

export function equipmentStatusTone(status: string | null | undefined): StatusTone {
  return EQUIPMENT_STATUS_META[status as EquipmentStatus]?.tone ?? 'neutral';
}
