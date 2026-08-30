import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock('@/lib/errors/toast', () => ({
  toastMutationError: vi.fn(),
}));

import { toastMutationError } from '@/lib/errors/toast';

// RPC-only supabase mock (stock movements never touch .from())
const mockRpc = vi.fn();
const mockSupabase = { rpc: mockRpc };

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return mockSupabase;
  },
}));

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

import { useMutateStockMovement } from '../useMutateStockMovement';

describe('useMutateStockMovement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createMovement', () => {
    it('calls supabase.rpc("create_stock_movement") with required + provided optional params', async () => {
      mockRpc.mockResolvedValueOnce({ data: 'mv-1', error: null });

      const { Wrapper } = makeWrapper();
      const { result } = renderHook(() => useMutateStockMovement(), {
        wrapper: Wrapper,
      });

      await act(async () => {
        await result.current.createMovement.mutateAsync({
          productId: 'p-1',
          movementType: 'compra',
          quantity: 5,
          unitCost: 1200,
          note: '  reposición inicial  ',
          actor_staff_id: 's-9',
        });
      });

      expect(mockRpc).toHaveBeenCalledWith('create_stock_movement', {
        p_product_id: 'p-1',
        p_type: 'compra',
        p_quantity: 5,
        p_unit_cost: 1200,
        p_note: 'reposición inicial',
        p_actor_staff_id: 's-9',
      });
    });

    it('omits optional params when not provided', async () => {
      mockRpc.mockResolvedValueOnce({ data: 'mv-2', error: null });

      const { Wrapper } = makeWrapper();
      const { result } = renderHook(() => useMutateStockMovement(), {
        wrapper: Wrapper,
      });

      await act(async () => {
        await result.current.createMovement.mutateAsync({
          productId: 'p-2',
          movementType: 'ajuste_manual',
          quantity: -2,
        });
      });

      expect(mockRpc).toHaveBeenCalledWith('create_stock_movement', {
        p_product_id: 'p-2',
        p_type: 'ajuste_manual',
        p_quantity: -2,
      });
    });

    it('success → invalidates products list and stock movements keys', async () => {
      mockRpc.mockResolvedValueOnce({ data: 'mv-3', error: null });

      const { queryClient, Wrapper } = makeWrapper();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useMutateStockMovement(), {
        wrapper: Wrapper,
      });

      await act(async () => {
        await result.current.createMovement.mutateAsync({
          productId: 'p-1',
          movementType: 'devolucion',
          quantity: 1,
        });
      });

      await waitFor(() =>
        expect(result.current.createMovement.isSuccess).toBe(true),
      );
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['admin', 'products', 'all', ''] }),
      );
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['admin', 'stock-movements', 'p-1'] }),
      );
    });

    it('success → shows success toast', async () => {
      mockRpc.mockResolvedValueOnce({ data: 'mv-4', error: null });

      const { Wrapper } = makeWrapper();
      const { result } = renderHook(() => useMutateStockMovement(), {
        wrapper: Wrapper,
      });

      await act(async () => {
        await result.current.createMovement.mutateAsync({
          productId: 'p-1',
          movementType: 'compra',
          quantity: 3,
        });
      });

      await waitFor(() =>
        expect(result.current.createMovement.isSuccess).toBe(true),
      );
      expect(toast.success).toHaveBeenCalledWith('Movimiento de stock registrado.');
    });

    it('error → delegates to toastMutationError', async () => {
      const dbError = { code: 'P0001', message: 'create_stock_movement: type not allowed' };
      mockRpc.mockResolvedValueOnce({ data: null, error: dbError });

      const { Wrapper } = makeWrapper();
      const { result } = renderHook(() => useMutateStockMovement(), {
        wrapper: Wrapper,
      });

      await act(async () => {
        try {
          await result.current.createMovement.mutateAsync({
            productId: 'p-1',
            movementType: 'reserva',
            quantity: 1,
          });
        } catch { /* expected */ }
      });

      await waitFor(() =>
        expect(result.current.createMovement.isError).toBe(true),
      );
      const calls = (toastMutationError as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      expect(calls[0]![0]).toEqual(dbError);
    });
  });

  describe('createProductWithStock', () => {
    it('calls supabase.rpc("create_product_with_initial_stock") with correct params', async () => {
      mockRpc.mockResolvedValueOnce({ data: 'new-product-uuid', error: null });

      const { Wrapper } = makeWrapper();
      const { result } = renderHook(() => useMutateStockMovement(), {
        wrapper: Wrapper,
      });

      await act(async () => {
        await result.current.createProductWithStock.mutateAsync({
          name: 'Llave Maestra',
          category: 'rfid_key',
          costPrice: 1500,
          quantity: 8,
          note: 'stock inicial',
          actor_staff_id: 's-9',
        });
      });

      expect(mockRpc).toHaveBeenCalledWith('create_product_with_initial_stock', {
        p_name: 'Llave Maestra',
        p_category: 'rfid_key',
        p_cost_price: 1500,
        p_quantity: 8,
        p_note: 'stock inicial',
        p_actor_staff_id: 's-9',
      });
    });

    it('success → invalidates products list + new product ledger key and shows toast', async () => {
      mockRpc.mockResolvedValueOnce({ data: 'new-product-uuid', error: null });

      const { queryClient, Wrapper } = makeWrapper();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useMutateStockMovement(), {
        wrapper: Wrapper,
      });

      await act(async () => {
        await result.current.createProductWithStock.mutateAsync({
          name: 'Equipo Cilindro',
          category: 'equipment',
          quantity: 4,
        });
      });

      await waitFor(() =>
        expect(result.current.createProductWithStock.isSuccess).toBe(true),
      );
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['admin', 'products', 'all', ''] }),
      );
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: ['admin', 'stock-movements', 'new-product-uuid'],
        }),
      );
      expect(toast.success).toHaveBeenCalledWith('Producto creado correctamente.');
    });

    it('23505 error → delegates to toastMutationError', async () => {
      const dbError = {
        code: '23505',
        message: 'duplicate key value violates unique constraint',
        details: 'Key (name)=(Llave Maestra) already exists.',
      };
      mockRpc.mockResolvedValueOnce({ data: null, error: dbError });

      const { Wrapper } = makeWrapper();
      const { result } = renderHook(() => useMutateStockMovement(), {
        wrapper: Wrapper,
      });

      await act(async () => {
        try {
          await result.current.createProductWithStock.mutateAsync({
            name: 'Llave Maestra',
            category: 'rfid_key',
            quantity: 1,
          });
        } catch { /* expected */ }
      });

      await waitFor(() =>
        expect(result.current.createProductWithStock.isError).toBe(true),
      );
      const calls = (toastMutationError as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      expect(calls[0]![0]).toEqual(dbError);
    });
  });
});
