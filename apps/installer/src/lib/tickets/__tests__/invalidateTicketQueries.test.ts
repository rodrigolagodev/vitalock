import { describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { invalidateTicketQueries } from '../invalidateTicketQueries';
import { assignedTicketsKey, historicalTicketsKey, ticketKey } from '@/lib/queryKeys';

describe('invalidateTicketQueries', () => {
  it('invalidates the worklist, the history and every ticket detail passed', () => {
    const queryClient = new QueryClient();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');

    invalidateTicketQueries(queryClient, 'staff-1', ['t-1', 't-2']);

    expect(spy).toHaveBeenCalledWith({ queryKey: assignedTicketsKey('staff-1') });
    expect(spy).toHaveBeenCalledWith({ queryKey: historicalTicketsKey('staff-1') });
    expect(spy).toHaveBeenCalledWith({ queryKey: ticketKey('t-1') });
    expect(spy).toHaveBeenCalledWith({ queryKey: ticketKey('t-2') });
    expect(spy).toHaveBeenCalledTimes(4);
  });

  it('still refreshes the lists when no ticket ids are given', () => {
    const queryClient = new QueryClient();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');

    invalidateTicketQueries(queryClient, 'staff-1', []);

    expect(spy).toHaveBeenCalledTimes(2);
  });
});
