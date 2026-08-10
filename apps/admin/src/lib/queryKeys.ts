export const administrationsKey = (status?: string, search?: string) =>
  ['admin', 'administrations', status ?? 'all', search ?? ''] as const;
export const administrationKey = (id: string) =>
  ['admin', 'administration', id] as const;
export const buildingsKey = (administrationId?: string) =>
  administrationId
    ? (['admin', 'buildings', administrationId] as const)
    : (['admin', 'buildings', 'all'] as const);
export const buildingKey = (id: string) => ['admin', 'building', id] as const;
export const unitsKey = (buildingId: string) => ['admin', 'units', buildingId] as const;
export const equipmentKey = (buildingId: string) => ['admin', 'equipment', buildingId] as const;
export const keysKey = (buildingId: string | undefined) =>
  ['admin', 'keys', buildingId ?? 'none'] as const;
export const decommissionImpactKey = (equipmentId: string) =>
  ['admin', 'decommission-impact', equipmentId] as const;
