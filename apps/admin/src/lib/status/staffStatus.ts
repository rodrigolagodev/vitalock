import { createStatusHelpers } from '@vitalock/ui';

/** Staff account status. Mirrors identity.staff.status CHECK. */
export type StaffStatus = 'active' | 'inactive';

export const staffStatus = createStatusHelpers<StaffStatus>({
  active: { label: 'Activo', tone: 'success' },
  inactive: { label: 'Inactivo', tone: 'neutral' },
});
