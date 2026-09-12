import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';

// Each `.from()` call gets its own chain so the test can script the embed
// attempt, the flat fallback and the identity.staff batch independently.
const mockSchema = vi.fn();
const mockCommentsOrder = vi.fn();
const mockStaffIn = vi.fn();

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return { schema: mockSchema };
  },
}));

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

import { useTicketComments } from '../useTicketComments';

const rawComment = {
  id: 'c-1',
  ticket_id: 't-1',
  body: 'Llegué al edificio.',
  created_at: '2026-09-02T12:00:00Z',
  author_staff_id: 's-2',
};

describe('useTicketComments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSchema.mockImplementation((schema: string) => ({
      from: (table: string) => {
        if (schema === 'support' && table === 'ticket_comments') {
          return {
            select: () => ({
              eq: () => ({ order: mockCommentsOrder }),
            }),
          };
        }
        if (schema === 'identity' && table === 'staff') {
          return { select: () => ({ in: mockStaffIn }) };
        }
        throw new Error(`unexpected ${schema}.${table}`);
      },
    }));
  });

  it('is disabled when ticketId is undefined', () => {
    const { result } = renderHook(() => useTicketComments(undefined), { wrapper: makeWrapper() });
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockSchema).not.toHaveBeenCalled();
  });

  it('maps the embedded author name when the cross-schema embed succeeds', async () => {
    mockCommentsOrder.mockResolvedValueOnce({
      data: [{ ...rawComment, author: { id: 's-2', full_name: 'Pablo Ruiz' } }],
      error: null,
    });

    const { result } = renderHook(() => useTicketComments('t-1'), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([
      {
        id: 'c-1',
        ticket_id: 't-1',
        body: 'Llegué al edificio.',
        created_at: '2026-09-02T12:00:00Z',
        author_staff_id: 's-2',
        author_full_name: 'Pablo Ruiz',
      },
    ]);
    expect(mockCommentsOrder).toHaveBeenCalledTimes(1);
    expect(mockStaffIn).not.toHaveBeenCalled();
  });

  it('falls back to a flat fetch + identity.staff batch on an embed error', async () => {
    mockCommentsOrder
      .mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST200', message: 'could not find relationship' },
      })
      .mockResolvedValueOnce({ data: [rawComment], error: null });
    mockStaffIn.mockResolvedValueOnce({
      data: [{ id: 's-2', full_name: 'Pablo Ruiz' }],
      error: null,
    });

    const { result } = renderHook(() => useTicketComments('t-1'), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockCommentsOrder).toHaveBeenCalledTimes(2);
    expect(mockStaffIn).toHaveBeenCalledWith('id', ['s-2']);
    expect(result.current.data?.[0]?.author_full_name).toBe('Pablo Ruiz');
  });

  it('truncates the staff id when the fallback cannot resolve the name', async () => {
    mockCommentsOrder
      .mockResolvedValueOnce({ data: null, error: { code: 'PGRST200', message: 'x' } })
      .mockResolvedValueOnce({
        data: [{ ...rawComment, author_staff_id: 'abcdef12-3456-7890' }],
        error: null,
      });
    mockStaffIn.mockResolvedValueOnce({ data: [], error: null });

    const { result } = renderHook(() => useTicketComments('t-1'), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.[0]?.author_full_name).toBe('abcdef12');
  });

  it('propagates non-embed errors without falling back', async () => {
    const dbError = { code: '42501', message: 'permission denied' };
    mockCommentsOrder.mockResolvedValueOnce({ data: null, error: dbError });

    const { result } = renderHook(() => useTicketComments('t-1'), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toEqual(dbError);
    expect(mockCommentsOrder).toHaveBeenCalledTimes(1);
  });
});
