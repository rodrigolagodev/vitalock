import type { StatusTone } from '@vitalock/ui';

/** Administration lifecycle status. Labels are FEMININE ("la administración"). */
type AdministrationStatus = 'active' | 'inactive';

const ADMINISTRATION_STATUS_META: Record<
  AdministrationStatus,
  { label: string; tone: StatusTone }
> = {
  active: { label: 'Activa', tone: 'success' },
  inactive: { label: 'Inactiva', tone: 'neutral' },
};

export function administrationStatusLabel(status: string | null | undefined): string {
  if (status == null) return '—';
  return ADMINISTRATION_STATUS_META[status as AdministrationStatus]?.label ?? status;
}

export function administrationStatusTone(status: string | null | undefined): StatusTone {
  return ADMINISTRATION_STATUS_META[status as AdministrationStatus]?.tone ?? 'neutral';
}
