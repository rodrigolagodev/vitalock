import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const mockStaffId = 'staff-bruno-001';
vi.mock('@/auth/AuthProvider', () => ({
  useAuthContext: () => ({
    staff: { id: mockStaffId, full_name: 'Bruno Installer', role: 'installer', status: 'active' },
  }),
}));

// Use vi.hoisted to declare mocks before the factory is executed
const { updateMock, eqMock } = vi.hoisted(() => {
  const eqMock = vi.fn().mockResolvedValue({ error: null });
  const updateMock = vi.fn().mockReturnValue({ eq: eqMock });
  return { updateMock, eqMock };
});

vi.mock('@/lib/supabase', () => ({
  supabase: {
    schema: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnValue({ update: updateMock }),
  },
}));

import { useAdvanceTicket } from '../useAdvanceTicket';

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe('useAdvanceTicket', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    eqMock.mockResolvedValue({ error: null });
    updateMock.mockReturnValue({ eq: eqMock });
  });

  it('always includes resolved_by_staff_id in the update payload (SC-R3-3)', async () => {
    const { result } = renderHook(() => useAdvanceTicket(), {
      wrapper: makeWrapper(),
    });

    await act(async () => {
      result.current.mutate({
        ticketId: 'ticket-abc',
        resolution_notes: 'Reemplacé el cilindro',
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'resolved',
        resolution_notes: 'Reemplacé el cilindro',
        resolved_by_staff_id: mockStaffId,
      }),
    );
  });

  it('resolved_by_staff_id is never null or undefined', async () => {
    const { result } = renderHook(() => useAdvanceTicket(), {
      wrapper: makeWrapper(),
    });

    await act(async () => {
      result.current.mutate({
        ticketId: 'ticket-xyz',
        resolution_notes: 'Trabajo completado',
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const payloadA = updateMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payloadA.resolved_by_staff_id).not.toBeNull();
    expect(payloadA.resolved_by_staff_id).not.toBeUndefined();
    expect(payloadA.resolved_by_staff_id).toBe(mockStaffId);
  });

  it('resolved_by_staff_id matches staff.id from useAuthContext', async () => {
    const { result } = renderHook(() => useAdvanceTicket(), {
      wrapper: makeWrapper(),
    });

    await act(async () => {
      result.current.mutate({
        ticketId: 'ticket-123',
        resolution_notes: 'Nota de prueba',
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const payload = updateMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.resolved_by_staff_id).toBe(mockStaffId);
  });
});
