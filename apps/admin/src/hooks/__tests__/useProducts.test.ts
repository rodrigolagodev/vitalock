import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';

// Shared mock refs — module-level so tests can inspect them
const mockSingle = vi.fn();
const mockOrder = vi.fn();
const mockEq = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return { from: mockFrom };
  },
}));

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

import { useProducts } from '../useProducts';
import { useProduct } from '../useProduct';

const fakeProducts = [
  {
    id: 'p-1',
    name: 'Llave Proximidad',
    category: 'rfid_key',
    cost_price: 1200,
    stock_total: 10,
    stock_reservado: 3,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'p-2',
    name: 'Equipo Cerrojo',
    category: 'equipment',
    cost_price: 8000,
    stock_total: 5,
    stock_reservado: 2,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
];

describe('useProducts', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Chain: select → [eq?] → order; order is the terminal step
    mockOrder.mockResolvedValue({ data: fakeProducts, error: null });
    mockSingle.mockResolvedValue({ data: fakeProducts[0], error: null });
    mockEq.mockReturnValue({ order: mockOrder, single: mockSingle });
    mockSelect.mockReturnValue({ eq: mockEq, order: mockOrder });
    mockFrom.mockReturnValue({ select: mockSelect });
  });

  it('queries the products table and returns rows mapped to ProductRow', async () => {
    const { result } = renderHook(() => useProducts(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockFrom).toHaveBeenCalledWith('products');
    expect(mockSelect).toHaveBeenCalledWith(
      'id, name, category, cost_price, stock_total, stock_reservado, created_at, updated_at',
    );
    expect(mockOrder).toHaveBeenCalledWith('name');

    // Derived column + category cast per row
    expect(result.current.data).toEqual([
      expect.objectContaining({
        id: 'p-1',
        category: 'rfid_key',
        stock_disponible: 7,
      }),
      expect.objectContaining({
        id: 'p-2',
        category: 'equipment',
        stock_disponible: 3,
      }),
    ]);
  });

  it('calls .eq("category", ...) when a category filter is provided', async () => {
    const { result } = renderHook(() => useProducts({ category: 'rfid_key' }), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockEq).toHaveBeenCalledWith('category', 'rfid_key');
  });

  it('does NOT call .eq() when no category filter is provided', async () => {
    const { result } = renderHook(() => useProducts({ search: 'llave' }), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockEq).not.toHaveBeenCalled();
  });

  it('filters rows client-side by name search', async () => {
    const { result } = renderHook(() => useProducts({ search: 'cerrojo' }), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0]!.id).toBe('p-2');
  });

  it('name search is case-insensitive and trims whitespace', async () => {
    const { result } = renderHook(() => useProducts({ search: '  EQUIPO  ' }), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0]!.id).toBe('p-2');
  });
});

describe('useProduct', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Chain: select → eq → single; single is the terminal step
    mockOrder.mockResolvedValue({ data: fakeProducts, error: null });
    mockSingle.mockResolvedValue({ data: fakeProducts[0], error: null });
    mockEq.mockReturnValue({ order: mockOrder, single: mockSingle });
    mockSelect.mockReturnValue({ eq: mockEq, order: mockOrder });
    mockFrom.mockReturnValue({ select: mockSelect });
  });

  it('fetches a single row by id and maps it to ProductRow', async () => {
    const { result } = renderHook(() => useProduct('p-1'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockFrom).toHaveBeenCalledWith('products');
    expect(mockEq).toHaveBeenCalledWith('id', 'p-1');
    expect(mockSingle).toHaveBeenCalledWith();
    expect(result.current.data).toEqual(
      expect.objectContaining({
        id: 'p-1',
        category: 'rfid_key',
        stock_disponible: 7,
      }),
    );
  });

  it('is disabled (query not executed) when id is empty', async () => {
    const { result } = renderHook(() => useProduct(undefined), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(mockFrom).not.toHaveBeenCalled());

    expect(result.current.isSuccess).toBe(false);
    expect(result.current.data).toBeUndefined();
  });
});
