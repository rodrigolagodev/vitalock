import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import type { OrdenRow } from '@/hooks/useOrdens';

const { useOrdensMock } = vi.hoisted(() => ({ useOrdensMock: vi.fn() }));

vi.mock('@/hooks/useOrdens', () => ({ useOrdens: useOrdensMock }));

import OrdenesPage from '../OrdenesPage';

function makeOrdenes(): OrdenRow[] {
  const base = {
    order_type: 'keys' as const,
    client_type: 'particular',
    administration_id: null,
    administrations: null,
    particular_full_name: 'Cliente',
    created_at: '2026-08-10T12:00:00Z',
    order_items: [{ id: 'item-1' }],
  };
  return [
    { ...base, id: 'o1', order_number: 'ORD-001', status: 'in_progress' },
    { ...base, id: 'o2', order_number: 'ORD-002', status: 'ready_for_pickup' },
    { ...base, id: 'o3', order_number: 'ORD-003', status: 'confirmed' },
    { ...base, id: 'o4', order_number: 'ORD-004', status: 'completed' },
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
        React.createElement(OrdenesPage),
      ),
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useOrdensMock.mockReturnValue({ data: [], isFetching: false, isError: false });
});

describe('OrdenesPage stat cards', () => {
  it('shows total, in-progress and ready-for-pickup counts derived from the loaded rows', () => {
    useOrdensMock.mockReturnValue({
      data: makeOrdenes(),
      isFetching: false,
      isError: false,
    });

    renderPage();

    const cards = screen.getByTestId('stat-cards');
    expect(within(cards).getByText('Total órdenes')).toBeInTheDocument();
    expect(within(cards).getByText('4')).toBeInTheDocument();
    expect(within(cards).getByText('En proceso')).toBeInTheDocument();
    expect(within(cards).getByText('Listo para retirar')).toBeInTheDocument();
    // One in-progress order and one ready-for-pickup order.
    expect(within(cards).getAllByText('1')).toHaveLength(2);
  });
});
