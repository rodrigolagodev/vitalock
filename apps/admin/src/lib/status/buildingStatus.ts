import { createStatusHelpers } from '@vitalock/ui';

/** Building lifecycle status. Labels are MASCULINE ("el edificio"). */
export type BuildingStatus = 'active' | 'inactive';

export const buildingStatus = createStatusHelpers<BuildingStatus>({
  active: { label: 'Activo', tone: 'success' },
  inactive: { label: 'Inactivo', tone: 'neutral' },
});
