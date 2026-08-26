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
export const particularesKey = (search?: string) =>
  ['admin', 'particulares', search ?? ''] as const;
export const particularKey = (id: string) => ['admin', 'particular', id] as const;
export const decommissionImpactKey = (equipmentId: string) =>
  ['admin', 'decommission-impact', equipmentId] as const;
export const keyOrdersKey = (
  status?: string,
  search?: string,
  administrationId?: string,
  buildingId?: string,
) =>
  [
    'admin',
    'key-orders',
    status ?? 'all',
    search ?? '',
    administrationId ?? 'all',
    buildingId ?? 'all',
  ] as const;
export const keyOrderKey = (id: string) => ['admin', 'key-order', id] as const;
export const technicalOrdersKey = (
  status?: string,
  search?: string,
  administrationId?: string,
  buildingId?: string,
) =>
  [
    'admin',
    'technical-orders',
    status ?? 'all',
    search ?? '',
    administrationId ?? 'all',
    buildingId ?? 'all',
  ] as const;
export const technicalOrderKey = (id: string) => ['admin', 'technical-order', id] as const;
export const allOrdersKey = (
  status?: string,
  search?: string,
  orderKind?: string,
  dateFrom?: string,
  dateTo?: string,
) =>
  [
    'admin',
    'all-orders',
    status ?? 'all',
    search ?? '',
    orderKind ?? 'all',
    dateFrom ?? '',
    dateTo ?? '',
  ] as const;
export const tareasKey = (
  search?: string,
  staffId?: string,
  buildingId?: string,
  status?: string,
) =>
  [
    'admin',
    'tareas',
    search ?? '',
    staffId ?? 'all',
    buildingId ?? 'all',
    status ?? 'all',
  ] as const;
export const staffKey = () => ['admin', 'staff'] as const;
export const buildingsByIdsKey = (ids: readonly string[]) =>
  ['admin', 'buildings', 'by-ids', ...[...ids].sort()] as const;
export const equipmentByIdsKey = (ids: readonly string[]) =>
  ['admin', 'equipment', 'by-ids', ...[...ids].sort()] as const;
export const staffByIdsKey = (ids: readonly string[]) =>
  ['admin', 'staff', 'by-ids', ...[...ids].sort()] as const;
export const personalKey = (search?: string, role?: string) =>
  ['admin', 'personal', search ?? '', role ?? 'all'] as const;
export const productsKey = (category?: string, search?: string) =>
  ['admin', 'products', category ?? 'all', search ?? ''] as const;
export const productKey = (id: string) => ['admin', 'product', id] as const;
export const stockMovementsKey = (productId: string) =>
  ['admin', 'stock-movements', productId] as const;

export const keysInventoryKey = (
  adminId?: string,
  buildingId?: string,
  equipmentId?: string,
  physicalStatus?: string,
  workflowStatus?: string,
) =>
  [
    'admin',
    'keys-inventory',
    adminId ?? 'all',
    buildingId ?? 'all',
    equipmentId ?? 'all',
    physicalStatus ?? 'all',
    workflowStatus ?? 'all',
  ] as const;

export const equipmentInventoryKey = (
  adminId?: string,
  buildingId?: string,
  status?: string,
) =>
  [
    'admin',
    'equipment-inventory',
    adminId ?? 'all',
    buildingId ?? 'all',
    status ?? 'all',
  ] as const;

export const equipmentByBuildingKey = (buildingId?: string) =>
  ['admin', 'equipment-by-building', buildingId ?? 'none'] as const;
