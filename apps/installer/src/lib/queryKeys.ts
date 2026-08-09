export const worklistKey = (staffId: string) => ['worklist', staffId] as const;
export const assignedTicketsKey = (staffId: string) => ['assigned-tickets', staffId] as const;
export const ticketCommentsKey = (ticketId: string) => ['ticket-comments', ticketId] as const;
