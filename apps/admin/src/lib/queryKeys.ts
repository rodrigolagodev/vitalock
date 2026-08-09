export const buildingsKey = () => ['admin', 'buildings'] as const;
export const buildingKey = (id: string) => ['admin', 'building', id] as const;
export const unitsKey = (buildingId: string) => ['admin', 'units', buildingId] as const;
export const equipmentKey = (buildingId: string) => ['admin', 'equipment', buildingId] as const;
export const decommissionImpactKey = (equipmentId: string) =>
  ['admin', 'decommission-impact', equipmentId] as const;
