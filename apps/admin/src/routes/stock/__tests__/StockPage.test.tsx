import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import type { ReactNode } from 'react';
import type { ProductRow } from '@/types/stock';

const { useProductsMock } = vi.hoisted(() => ({ useProductsMock: vi.fn() }));

vi.mock('@/hooks/useProducts', () => ({ useProducts: useProductsMock }));
vi.mock('@/components/stock/CargarProductoSheet', () => ({
  CargarProductoSheet: () => null,
}));

import StockPage from '../StockPage';

function makeProducts(): ProductRow[] {
  return [
    {
      id: 'p1',
      name: 'Llave RFID',
      category: 'rfid_key',
      cost_price: 1500,
      stock_total: 10,
      stock_reservado: 6,
      stock_disponible: 4,
      created_at: '2026-08-01T10:00:00Z',
      updated_at: '2026-08-10T10:00:00Z',
    },
    {
      id: 'p2',
      name: 'Lector de proximidad',
      category: 'equipment',
      cost_price: 45000,
      stock_total: 8,
      stock_reservado: 3,
      stock_disponible: 5,
      created_at: '2026-08-01T10:00:00Z',
      updated_at: '2026-08-10T10:00:00Z',
    },
    {
      id: 'p3',
      name: 'Fuente de alimentación',
      category: 'equipment',
      cost_price: 9000,
      stock_total: 30,
      stock_reservado: 0,
      stock_disponible: 30,
      created_at: '2026-08-01T10:00:00Z',
      updated_at: '2026-08-10T10:00:00Z',
    },
  ];
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(StockPage),
      ),
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useProductsMock.mockReturnValue({ data: [], isFetching: false, isError: false });
});

describe('StockPage stat cards', () => {
  it('shows total products and low-stock count derived from the loaded rows', () => {
    useProductsMock.mockReturnValue({
      data: makeProducts(),
      isFetching: false,
      isError: false,
    });

    renderPage();

    const cards = screen.getByTestId('stat-cards');
    expect(within(cards).getByText('Total productos')).toBeInTheDocument();
    expect(within(cards).getByText('3')).toBeInTheDocument();
    expect(within(cards).getByText('Stock bajo')).toBeInTheDocument();
    expect(within(cards).getByText('2')).toBeInTheDocument();
  });
});
