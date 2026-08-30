import type { StatusTone } from '@vitalock/ui';

/** Staff role (who can perform work on the platform). */
export type StaffRole = 'admin' | 'installer';

export const STAFF_ROLE_META: Record<StaffRole, { label: string; tone: StatusTone }> = {
  admin: { label: 'Admin', tone: 'brand' },
  installer: { label: 'Instalador', tone: 'info' },
};

export function staffRoleLabel(role: string | null | undefined): string {
  if (role == null) return '—';
  return STAFF_ROLE_META[role as StaffRole]?.label ?? role;
}

export function staffRoleTone(role: string | null | undefined): StatusTone {
  return STAFF_ROLE_META[role as StaffRole]?.tone ?? 'neutral';
}
