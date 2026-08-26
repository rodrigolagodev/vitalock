import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import type { KeyOrderListRow } from '@/hooks/useKeyOrders';

const { useKeyOrdersMock } = vi.hoisted(() => ({ useKeyOrdersMock: vi.fn() }));

vi.mock('@/hooks/useKeyOrders', () => ({ useKeyOrders: useKeyOrdersMock }));
vi.mock('@/hooks/useAdministrations', () => ({
  useAdministrations: () => ({ data: [], isLoading: false }),
}));

import KeyOrdersPage from '../KeyOrdersPage';

function makeRows(): KeyOrderListRow[] {
  const base = {
    client_type: 'particular' as const,
    administration_id: null,
    administrations: null,
    particular_full_name: 'Cliente Test',
    created_at: '2026-08-10T12:00:00Z',
    key_order_items: [{ id: 'item-1' }],
  };
  return [
    { ...base, id: 'ko1', order_number: 'ORD-LLV-000001', status: 'confirmed' },
    { ...base, id: 'ko2', order_number: 'ORD-LLV-000002', status: 'ready_for_pickup' },
    { ...base, id: 'ko3', order_number: 'ORD-LLV-000003', status: 'in_progress' },
    { ...base, id: 'ko4', order_number: 'ORD-LLV-000004', status: 'completed' },
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
        React.createElement(KeyOrdersPage),
      ),
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useKeyOrdersMock.mockReturnValue({ data: [], isFetching: false, isError: false });
});

describe('KeyOrdersPage stat cards', () => {
  it('shows total, open, and completed counts from loaded rows', () => {
    useKeyOrdersMock.mockReturnValue({
      data: makeRows(),
      isFetching: false,
      isError: false,
    });

    renderPage();

    const cards = screen.getByTestId('stat-cards');
    expect(within(cards).getByText('Total órdenes')).toBeInTheDocument();
    expect(within(cards).getByText('4')).toBeInTheDocument();
    expect(within(cards).getByText('Abiertas')).toBeInTheDocument();
    expect(within(cards).getByText('Completadas')).toBeInTheDocument();
  });
});

describe('KeyOrdersPage list', () => {
  it('renders the page heading', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: /llaves/i })).toBeInTheDocument();
  });

  it('renders empty state when no data', () => {
    renderPage();
    expect(screen.getByText(/no hay órdenes de llave/i)).toBeInTheDocument();
  });

  it('renders the Nueva orden link', () => {
    renderPage();
    const link = screen.getByRole('link', { name: /nueva orden/i });
    expect(link).toHaveAttribute('href', '/llaves/nueva');
  });
});

describe('KeyOrdersPage status filter', () => {
  it('passes status filter to useKeyOrders when a status pill is clicked', async () => {
    useKeyOrdersMock.mockReturnValue({
      data: [],
      isFetching: false,
      isError: false,
    });

    renderPage();

    const confirmedPill = screen.getByRole('button', { name: /confirmada/i });
    await userEvent.click(confirmedPill);

    // After clicking, the hook should be called with status: 'confirmed'.
    const lastCall = useKeyOrdersMock.mock.calls.at(-1)?.[0];
    expect(lastCall?.status).toBe('confirmed');
  });
});

describe('KeyOrdersPage error state', () => {
  it('shows an error message when isError is true', () => {
    useKeyOrdersMock.mockReturnValue({
      data: undefined,
      isFetching: false,
      isError: true,
    });

    renderPage();
    expect(screen.getByText(/error al cargar/i)).toBeInTheDocument();
  });
});
