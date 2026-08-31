import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import type { ProductRow, StockMovementRow } from '@/types/stock';

const { useParamsMock, useProductMock, useMutateProductMock, useStockMovementsMock } =
  vi.hoisted(() => ({
    useParamsMock: vi.fn(),
    useProductMock: vi.fn(),
    useMutateProductMock: vi.fn(),
    useStockMovementsMock: vi.fn(),
  }));

const mockUpdateProduct = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>(
    'react-router-dom',
  );
  return {
    ...actual,
    useParams: useParamsMock,
  };
});

vi.mock('@/hooks/useProduct', () => ({ useProduct: useProductMock }));
vi.mock('@/hooks/useMutateProduct', () => ({
  useMutateProduct: useMutateProductMock,
}));
vi.mock('@/hooks/useStockMovements', () => ({
  useStockMovements: useStockMovementsMock,
}));
vi.mock('@/components/stock/StockMovementsTable', () => ({
  StockMovementsTable: () => null,
}));
vi.mock('@/components/stock/AjusteStockSheet', () => ({
  AjusteStockSheet: () => null,
}));

import StockDetailPage from '../StockDetailPage';

const PRODUCT: ProductRow = {
  id: 'p1',
  name: 'Llave RFID',
  category: 'rfid_key',
  cost_price: 1500,
  stock_total: 10,
  stock_reservado: 6,
  stock_disponible: 4,
  created_at: '2026-08-01T10:00:00Z',
  updated_at: '2026-08-10T10:00:00Z',
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(StockDetailPage),
      ),
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useParamsMock.mockReturnValue({ productId: 'p1' });
  useProductMock.mockReturnValue({ data: PRODUCT, isLoading: false, isError: false });
  useMutateProductMock.mockReturnValue({
    updateProduct: { mutate: mockUpdateProduct, isPending: false },
  });
  useStockMovementsMock.mockReturnValue({ data: [] as StockMovementRow[], isFetching: false });
});

describe('StockDetailPage', () => {
  it('renders a live stock snapshot with the four metrics', () => {
    renderPage();

    const stats = screen.getByTestId('product-stats');
    expect(within(stats).getByText('Disponible')).toBeInTheDocument();
    expect(within(stats).getByText('4')).toBeInTheDocument();
    expect(within(stats).getByText('Reservado')).toBeInTheDocument();
    expect(within(stats).getByText('6')).toBeInTheDocument();
    expect(within(stats).getByText('Total')).toBeInTheDocument();
    expect(within(stats).getByText('10')).toBeInTheDocument();
    expect(within(stats).getByText('Costo de compra')).toBeInTheDocument();
    expect(within(stats).getByText(/1\.500,00/)).toBeInTheDocument();
  });

  it('shows the category as a non-editable badge and a rename affordance', () => {
    renderPage();

    // Category is identity, not editable — rendered as a badge.
    expect(screen.getByTestId('product-category')).toHaveTextContent('Llave RFID');

    // The title is editable inline via a pencil affordance.
    expect(screen.getByRole('button', { name: 'Renombrar' })).toBeInTheDocument();

    // No edit card / category selector remains.
    expect(screen.queryByRole('radiogroup', { name: 'Categoría' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument();
  });

  it('renames the product from the header title on Enter', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Renombrar' }));
    const input = screen.getByLabelText('Nombre del producto');
    expect(input).toHaveValue('Llave RFID');

    await user.clear(input);
    await user.type(input, 'Llave RFID Premium');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(mockUpdateProduct).toHaveBeenCalledWith({
        id: 'p1',
        name: 'Llave RFID Premium',
      });
    });
  });

  it('discards the rename on Escape', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Renombrar' }));
    const input = screen.getByLabelText('Nombre del producto');
    await user.clear(input);
    await user.type(input, 'Nombre temporal');
    await user.keyboard('{Escape}');

    // Back to display mode without saving; the rename affordance is back.
    expect(screen.getByRole('button', { name: 'Renombrar' })).toBeInTheDocument();
    expect(mockUpdateProduct).not.toHaveBeenCalled();
  });
});
