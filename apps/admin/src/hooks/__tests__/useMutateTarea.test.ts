import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock('@/lib/errors/toast', () => ({
  toastMutationError: vi.fn(),
}));

import { toastMutationError } from '@/lib/errors/toast';

// Chainable supabase mock for schema('support').from().update().eq().select().single()
const mockSingle = vi.fn();
const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
const mockEq = vi.fn().mockReturnValue({ select: mockSelect });
const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
const mockFrom = vi.fn().mockReturnValue({ update: mockUpdate });
const mockSchema = vi.fn().mockReturnValue({ from: mockFrom });
// Also support direct .from() for createTarea (no schema prefix)
const mockFromDirect = vi.fn().mockReturnValue({
  insert: vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({ single: vi.fn() }),
  }),
});

const mockSupabase = {
  schema: mockSchema,
  from: mockFromDirect,
};

vi.mock('@/lib/supabase', () => ({ get supabase() { return mockSupabase; } }));

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

import { useMutateTarea } from '../useMutateTarea';

describe('useMutateTarea', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset chain
    mockSingle.mockResolvedValue({ data: null, error: null });
    mockSelect.mockReturnValue({ single: mockSingle });
    mockEq.mockReturnValue({ select: mockSelect });
    mockUpdate.mockReturnValue({ eq: mockEq });
    mockFrom.mockReturnValue({ update: mockUpdate });
    mockSchema.mockReturnValue({ from: mockFrom });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // updateTarea — terminal immutability
  // ──────────────────────────────────────────────────────────────────────────

  it('updateTarea against a resolved-status row → DB returns P0001 → surfaces via toastMutationError', async () => {
    // Simulate the trigger rejecting the update (TICKETS_TERMINAL guard)
    const dbError = { code: 'P0001', message: 'TICKETS_TERMINAL: cannot modify tickets row (status: resolved)' };
    mockSingle.mockResolvedValue({ data: null, error: dbError });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateTarea(), { wrapper: Wrapper });

    await act(async () => {
      try {
        await result.current.updateTarea.mutateAsync({
          id: 'ticket-resolved',
          description: 'attempt to modify terminal ticket',
        });
      } catch { /* expected — mutation throws on error */ }
    });

    await waitFor(() => expect(result.current.updateTarea.isError).toBe(true));
    const calls = (toastMutationError as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0]![0]).toEqual(dbError);
  });

  it('updateTarea against a cancelled-status row → DB returns P0001 → surfaces via toastMutationError', async () => {
    const dbError = { code: 'P0001', message: 'TICKETS_TERMINAL: cannot modify tickets row (status: cancelled)' };
    mockSingle.mockResolvedValue({ data: null, error: dbError });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateTarea(), { wrapper: Wrapper });

    await act(async () => {
      try {
        await result.current.updateTarea.mutateAsync({
          id: 'ticket-cancelled',
          notes: 'attempt to modify terminal ticket',
        });
      } catch { /* expected */ }
    });

    await waitFor(() => expect(result.current.updateTarea.isError).toBe(true));
    const calls = (toastMutationError as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0]![0]).toEqual(dbError);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // updateTarea — success path (non-terminal status)
  // ──────────────────────────────────────────────────────────────────────────

  it('updateTarea success → shows success toast', async () => {
    const { toast } = await import('sonner');
    const updatedRow = { id: 'ticket-open', status: 'in_progress' };
    mockSingle.mockResolvedValue({ data: updatedRow, error: null });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateTarea(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.updateTarea.mutateAsync({
        id: 'ticket-open',
        status: 'in_progress',
      });
    });

    await waitFor(() => expect(result.current.updateTarea.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith('Tarea actualizada correctamente.');
  });

  it('updateTarea calls schema("support").from("tickets").update(...).eq("id", id)', async () => {
    const updatedRow = { id: 'ticket-open' };
    mockSingle.mockResolvedValue({ data: updatedRow, error: null });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMutateTarea(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.updateTarea.mutateAsync({
        id: 'ticket-open',
        description: 'updated desc',
      });
    });

    expect(mockSchema).toHaveBeenCalledWith('support');
    expect(mockFrom).toHaveBeenCalledWith('tickets');
    expect(mockUpdate).toHaveBeenCalledWith({ description: 'updated desc' });
    expect(mockEq).toHaveBeenCalledWith('id', 'ticket-open');
  });
});
