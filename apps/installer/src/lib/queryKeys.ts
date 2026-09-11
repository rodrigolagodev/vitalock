// Every key starts with the app name so the two apps' caches can never
// collide if they ever share a QueryClient or a persister.
export const worklistKey = (staffId: string) => ['installer', 'worklist', staffId] as const;
export const assignedTicketsKey = (staffId: string) =>
  ['installer', 'assigned-tickets', staffId] as const;
export const historicalTicketsKey = (staffId: string) =>
  ['installer', 'historical-tickets', staffId] as const;
export const ticketCommentsKey = (ticketId: string) =>
  ['installer', 'ticket-comments', ticketId] as const;
export const equipmentByIdKey = (equipmentId: string) =>
  ['installer', 'equipment-by-id', equipmentId] as const;
export const equipmentMaintenanceHistoryKey = (equipmentId: string) =>
  ['installer', 'equipment-maintenance-history', equipmentId] as const;
export const equipmentUpdateHistoryKey = (equipmentId: string) =>
  ['installer', 'equipment-update-history', equipmentId] as const;
/** `keyIds` is sorted + joined by the caller so the key is order-independent. */
export const rfidKeyCodesKey = (stableIds: string) =>
  ['installer', 'rfid-key-codes', stableIds] as const;
