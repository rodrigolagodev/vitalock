import { createStatusHelpers } from '@vitalock/ui';

/** Administration lifecycle status. Labels are FEMININE ("la administración"). */
export type AdministrationStatus = 'active' | 'inactive';

export const administrationStatus = createStatusHelpers<AdministrationStatus>({
  active: { label: 'Activa', tone: 'success' },
  inactive: { label: 'Inactiva', tone: 'neutral' },
});
