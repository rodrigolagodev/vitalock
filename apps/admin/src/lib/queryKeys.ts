export const administrationsKey = (status?: string, search?: string) =>
  ['admin', 'administrations', status ?? 'all', search ?? ''] as const;
export const administrationKey = (id: string) => ['admin', 'administration', id] as const;
export const buildingsKey = (administrationId?: string) =>
  administrationId
    ? (['admin', 'buildings', administrationId] as const)
    : (['admin', 'buildings', 'all'] as const);
export const buildingKey = (id: string) => ['admin', 'building', id] as const;
export const unitsKey = (buildingId: string) => ['admin', 'units', buildingId] as const;
export const equipmentKey = (buildingId: string, scope?: 'active' | 'all') =>
  scope
    ? (['admin', 'equipment', buildingId, scope] as const)
    : (['admin', 'equipment', buildingId] as const);
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

export const equipmentInventoryKey = (adminId?: string, buildingId?: string, status?: string) =>
  ['admin', 'equipment-inventory', adminId ?? 'all', buildingId ?? 'all', status ?? 'all'] as const;

export const equipmentByBuildingKey = (buildingId?: string, scope?: 'active' | 'all') =>
  scope
    ? (['admin', 'equipment-by-building', buildingId ?? 'none', scope] as const)
    : (['admin', 'equipment-by-building', buildingId ?? 'none'] as const);

export const equipmentUpdatesKey = (equipmentId: string) =>
  ['admin', 'equipment-updates', equipmentId] as const;
export const equipmentUpdateHistoryKey = (equipmentId: string) =>
  ['admin', 'equipment-update-history', equipmentId] as const;

export const keyEventsKey = (keyId: string | undefined) =>
  ['admin', 'key-events', keyId ?? 'none'] as const;

// ── Detail / lookup keys ────────────────────────────────────────────────────
export const tareaKey = (id: string) => ['admin', 'tarea', id] as const;
export const keyDetailKey = (keyId: string | undefined) =>
  ['admin', 'key-detail', keyId ?? 'none'] as const;
export const equipmentDetailKey = (equipmentId: string | undefined) =>
  ['admin', 'equipment-detail', equipmentId ?? 'none'] as const;
export const orderKeyDetailsKey = (keyId: string | undefined) =>
  ['admin', 'order-keys', 'details', keyId ?? ''] as const;
export const technicalOrderTicketsKey = (orderId: string | undefined) =>
  ['admin', 'technical-orders', orderId ?? '', 'tickets'] as const;
export const pendingKeysForEquipmentKey = (equipmentId: string) =>
  ['admin', 'pending-keys-for-equipment', equipmentId] as const;
export const productsByIdsKey = (ids: readonly string[]) =>
  ['admin', 'products', 'by-ids', ...[...ids].sort()] as const;

// ── Root keys — invalidate every variant of a list in one call ─────────────
// TanStack matches by prefix, so `['admin', 'tareas']` covers `tareasKey(...)`
// for every filter combination. Prefer these over hand-written prefixes.
export const administrationsRootKey = () => ['admin', 'administrations'] as const;
export const buildingsRootKey = () => ['admin', 'buildings'] as const;
export const keyOrdersRootKey = () => ['admin', 'key-orders'] as const;
export const tareasRootKey = () => ['admin', 'tareas'] as const;
export const personalRootKey = () => ['admin', 'personal'] as const;
