import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';

import { StockMovementsTable } from '../StockMovementsTable';
import type { StockMovementRow } from '@/types/stock';

const entrada: StockMovementRow = {
  id: 'm-1',
  created_at: '2026-07-01T10:00:00Z',
  created_by: null,
  note: 'Reposición inicial',
  order_id: null,
  order_item_id: null,
  order_kind: null,
  product_id: 'p-1',
  quantity: 5,
  staff_id: null,
  ticket_id: null,
  type: 'compra',
  unit_cost: 1500,
  ticket_number: 'T-0001',
  staff_name: 'Ana Gómez',
};

const egreso: StockMovementRow = {
  id: 'm-2',
  created_at: '2026-07-02T11:30:00Z',
  created_by: null,
  note: null,
  order_id: 'abcdef1234567890',
  order_item_id: 'oi-1',
  order_kind: 'key',
  product_id: 'p-1',
  quantity: -2,
  staff_id: null,
  ticket_id: null,
  type: 'egreso_instalacion',
  unit_cost: null,
  ticket_number: null,
  staff_name: null,
};

function makeRows(count: number): StockMovementRow[] {
  return Array.from({ length: count }, (_, i) => ({
    ...entrada,
    id: `m-${i + 1}`,
    quantity: i % 2 === 0 ? 3 : -1,
  }));
}

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe('StockMovementsTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders movement rows with labels, quantities, cost, staff and reference', () => {
    render(
      <StockMovementsTable rows={[entrada, egreso]} isFetching={false} />,
      { wrapper: makeWrapper() },
    );

    expect(screen.getByText('Compra')).toBeInTheDocument();
    expect(screen.getByText('Egreso por instalación')).toBeInTheDocument();
    expect(screen.getByText('+5')).toBeInTheDocument();
    expect(screen.getByText('-2')).toBeInTheDocument();
    expect(screen.getByText(/\$\s*1\.500/)).toBeInTheDocument();
    expect(screen.getByText('Ana Gómez')).toBeInTheDocument();
    expect(screen.getByText('T-0001')).toBeInTheDocument();
    expect(screen.getByText('Orden abcdef12…')).toBeInTheDocument();
    expect(screen.getByText('Reposición inicial')).toBeInTheDocument();
  });

  it('renders the loading skeleton while fetching', () => {
    render(<StockMovementsTable rows={[]} isFetching />, { wrapper: makeWrapper() });

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('Fecha')).toBeInTheDocument();
  });

  it('shows the plain empty state when there are no rows and no filters', () => {
    render(<StockMovementsTable rows={[]} isFetching={false} />, {
      wrapper: makeWrapper(),
    });

    expect(
      screen.getByText('No hay movimientos de stock para este producto.'),
    ).toBeInTheDocument();
  });

  it('shows the filtered empty state when filters are applied', () => {
    render(
      <StockMovementsTable rows={[]} isFetching={false} hasFilters />,
      { wrapper: makeWrapper() },
    );

    expect(
      screen.getByText('No se encontraron movimientos con los filtros aplicados.'),
    ).toBeInTheDocument();
  });

  it('renders the pagination footer and only the first 10 rows', () => {
    render(<StockMovementsTable rows={makeRows(12)} isFetching={false} />, {
      wrapper: makeWrapper(),
    });

    expect(screen.getByText('1–10 de 12')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(11); // 1 header + 10 body rows
  });
});
