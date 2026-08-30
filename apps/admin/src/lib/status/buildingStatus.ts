import type { StatusTone } from '@vitalock/ui';

/** Building lifecycle status. Labels are MASCULINE ("el edificio"). */
export type BuildingStatus = 'active' | 'inactive';

export const BUILDING_STATUS_META: Record<
  BuildingStatus,
  { label: string; tone: StatusTone }
> = {
  active: { label: 'Activo', tone: 'success' },
  inactive: { label: 'Inactivo', tone: 'neutral' },
};

export function buildingStatusLabel(status: string | null | undefined): string {
  if (status == null) return '—';
  return BUILDING_STATUS_META[status as BuildingStatus]?.label ?? status;
}

export function buildingStatusTone(status: string | null | undefined): StatusTone {
  return BUILDING_STATUS_META[status as BuildingStatus]?.tone ?? 'neutral';
}
