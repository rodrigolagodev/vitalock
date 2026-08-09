import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const mockStaffId = 'staff-bruno-001';
vi.mock('@/auth/AuthProvider', () => ({
  useAuthContext: () => ({
    staff: { id: mockStaffId, full_name: 'Bruno Installer', role: 'installer', status: 'active' },
  }),
}));

const { insertMock } = vi.hoisted(() => {
  const insertMock = vi.fn().mockResolvedValue({ error: null });
  return { insertMock };
});

vi.mock('@/lib/supabase', () => ({
  supabase: {
    schema: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnValue({ insert: insertMock }),
  },
}));

import { useAddComment } from '../useAddComment';
import type { TicketComment } from '../useTicketComments';

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    queryClient,
    Wrapper: function Wrapper({ children }: { children: ReactNode }) {
      return React.createElement(QueryClientProvider, { client: queryClient }, children);
    },
  };
}

describe('useAddComment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertMock.mockResolvedValue({ error: null });
  });

  it('reverts to snapshot on error — no pending comment remains (SC-R2-3)', async () => {
    const ticketId = 'ticket-001';
    const queryKey = ['ticket-comments', ticketId];

    insertMock.mockResolvedValue({ error: { code: '50000', message: 'server error' } });

    const { queryClient, Wrapper } = makeWrapper();

    const existingComments: TicketComment[] = [
      {
        id: 'comment-existing',
        ticket_id: ticketId,
        body: 'Comentario previo',
        created_at: '2026-08-09T10:00:00Z',
        author_staff_id: 'staff-other',
        author_full_name: 'Otro Staff',
      },
    ];
    queryClient.setQueryData(queryKey, existingComments);

    const { result } = renderHook(() => useAddComment(), { wrapper: Wrapper });

    await act(async () => {
      result.current.mutate({ ticketId, body: 'Nuevo comentario' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    const cached = queryClient.getQueryData<TicketComment[]>(queryKey) ?? [];
    expect(cached).toHaveLength(1);
    expect(cached[0]?.id).toBe('comment-existing');
    expect(cached.some((c) => c._pending)).toBe(false);
  });

  it('appends pending comment optimistically before DB confirms', async () => {
    const ticketId = 'ticket-002';
    const queryKey = ['ticket-comments', ticketId];

    let resolveInsert!: () => void;
    insertMock.mockReturnValue(
      new Promise<{ error: null }>((resolve) => {
        resolveInsert = () => resolve({ error: null });
      }),
    );

    const { queryClient, Wrapper } = makeWrapper();
    queryClient.setQueryData<TicketComment[]>(queryKey, []);

    const { result } = renderHook(() => useAddComment(), { wrapper: Wrapper });

    act(() => {
      result.current.mutate({ ticketId, body: 'Optimistic comment' });
    });

    await waitFor(() => {
      const cached = queryClient.getQueryData<TicketComment[]>(queryKey);
      return (cached ?? []).some((c) => c._pending);
    });

    const optimistic = queryClient.getQueryData<TicketComment[]>(queryKey);
    expect(optimistic?.some((c) => c._pending && c.body === 'Optimistic comment')).toBe(true);

    resolveInsert();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});
