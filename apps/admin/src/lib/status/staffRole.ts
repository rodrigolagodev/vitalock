import { createStatusHelpers } from '@vitalock/ui';

/** Staff role (who can perform work on the platform). */
export type StaffRole = 'admin' | 'installer';

export const staffRole = createStatusHelpers<StaffRole>({
  admin: { label: 'Admin', tone: 'brand' },
  installer: { label: 'Instalador', tone: 'info' },
});
