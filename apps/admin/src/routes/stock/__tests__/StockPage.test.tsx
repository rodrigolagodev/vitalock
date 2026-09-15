import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
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

describe('StockPage search input', () => {
  it('renders the search input', () => {
    renderPage();
    expect(screen.getByPlaceholderText(/buscar por nombre/i)).toBeInTheDocument();
  });
});

describe('StockPage category filter (FilterBar.Select, 2 real values)', () => {
  it('passes the selected category to useProducts', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('combobox', { name: /^categoría$/i }));
    await user.click(screen.getByRole('option', { name: /^llaves rfid$/i }));

    const lastCall = useProductsMock.mock.calls.at(-1)?.[0];
    expect(lastCall?.category).toBe('rfid_key');
  });
});

describe('StockPage FilterBar.Summary', () => {
  it('shows no "Limpiar todo" button when no filters are active', () => {
    renderPage();
    expect(screen.queryByRole('button', { name: /limpiar todo/i })).not.toBeInTheDocument();
  });

  // Multi-facet "Limpiar todo" regression test (required by this batch): this
  // page holds filter state in plain useState (search/category), NOT
  // useSearchParams, so it should NOT hit the Batch 12 react-router-dom
  // setSearchParams non-composition bug — each onClear resolves against its
  // own independent React state setter and React batches them into one
  // re-render.
  it('clears every active facet (search, category) when "Limpiar todo" is clicked once', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByPlaceholderText(/buscar por nombre/i), 'Llave');
    await waitFor(() => {
      expect(useProductsMock.mock.calls.at(-1)?.[0]?.search).toBe('Llave');
    });

    await user.click(screen.getByRole('combobox', { name: /^categoría$/i }));
    await user.click(screen.getByRole('option', { name: /^llaves rfid$/i }));

    const clearAll = screen.getByRole('button', { name: /limpiar todo/i });
    await user.click(clearAll);

    const lastCall = useProductsMock.mock.calls.at(-1)?.[0];
    expect(lastCall?.search).toBe('');
    expect(lastCall?.category).toBeUndefined();
    expect(screen.queryByRole('button', { name: /limpiar todo/i })).not.toBeInTheDocument();
  });
});
