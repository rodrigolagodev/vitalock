import type { QueryClient } from '@tanstack/react-query';
import { assignedTicketsKey, historicalTicketsKey, ticketKey } from '@/lib/queryKeys';

/**
 * Invalidates every installer query that mirrors a ticket after a mutation:
 * the worklist, the closed-tasks history and the single-ticket detail(s).
 * Keeping the three together prevents a resolved task from lingering in one
 * cache while the others already moved on.
 */
export function invalidateTicketQueries(
  queryClient: QueryClient,
  staffId: string,
  ticketIds: readonly string[],
): void {
  void queryClient.invalidateQueries({ queryKey: assignedTicketsKey(staffId) });
  void queryClient.invalidateQueries({ queryKey: historicalTicketsKey(staffId) });
  for (const id of ticketIds) {
    void queryClient.invalidateQueries({ queryKey: ticketKey(id) });
  }
}
