export const worklistKey = (staffId: string) => ['worklist', staffId] as const;
export const assignedTicketsKey = (staffId: string) => ['assigned-tickets', staffId] as const;
export const ticketCommentsKey = (ticketId: string) => ['ticket-comments', ticketId] as const;
export const equipmentByIdKey = (equipmentId: string) => ['equipment-by-id', equipmentId] as const;
export const equipmentMaintenanceHistoryKey = (equipmentId: string) =>
  ['equipment-maintenance-history', equipmentId] as const;
export const equipmentUpdateHistoryKey = (equipmentId: string) =>
  ['equipment-update-history', equipmentId] as const;
