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

import { useMarkAuthorization } from '../useMarkAuthorization';

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe('useMarkAuthorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    eqMock.mockResolvedValue({ error: null });
    updateMock.mockReturnValue({ eq: eqMock });
  });

  it('install payload includes installed_by_staff_id (SC-R2-1)', async () => {
    const { result } = renderHook(() => useMarkAuthorization(), {
      wrapper: makeWrapper(),
    });

    await act(async () => {
      result.current.mutate({ authorizationId: 'auth-001', kind: 'install' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sync_state: 'installed',
        installed_by_staff_id: mockStaffId,
      }),
    );
  });

  it('remove payload includes removed_by_staff_id and remove_reason (SC-R3-1)', async () => {
    const { result } = renderHook(() => useMarkAuthorization(), {
      wrapper: makeWrapper(),
    });

    await act(async () => {
      result.current.mutate({
        authorizationId: 'auth-002',
        kind: 'remove',
        remove_reason: 'Cliente solicitó baja',
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sync_state: 'removed',
        removed_by_staff_id: mockStaffId,
        remove_reason: 'Cliente solicitó baja',
      }),
    );
  });

  it('remove with empty textarea sends remove_reason: null (SC-R3-SC1)', async () => {
    const { result } = renderHook(() => useMarkAuthorization(), {
      wrapper: makeWrapper(),
    });

    await act(async () => {
      result.current.mutate({
        authorizationId: 'auth-003',
        kind: 'remove',
        remove_reason: null,
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sync_state: 'removed',
        removed_by_staff_id: mockStaffId,
        remove_reason: null,
      }),
    );
  });
});
