import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import type { TechnicalOrderListRow } from '@/hooks/useTechnicalOrders';

const { useTechnicalOrdersMock } = vi.hoisted(() => ({
  useTechnicalOrdersMock: vi.fn(),
}));

vi.mock('@/hooks/useTechnicalOrders', () => ({
  useTechnicalOrders: useTechnicalOrdersMock,
}));
vi.mock('@/hooks/useAdministrations', () => ({
  useAdministrations: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/hooks/useBuildings', () => ({
  useBuildings: () => ({ data: [], isLoading: false }),
}));

import TechnicalOrdersPage from '../TechnicalOrdersPage';

function makeRows(): TechnicalOrderListRow[] {
  const base = {
    client_type: 'particular' as const,
    administration_id: null,
    administrations: null,
    particular_full_name: 'Cliente Test',
    created_at: '2026-08-10T12:00:00Z',
    technical_order_items: [{ id: 'ti-1' }],
  };
  return [
    { ...base, id: 'to1', order_number: 'ORD-TEC-000001', status: 'confirmed' },
    { ...base, id: 'to2', order_number: 'ORD-TEC-000002', status: 'in_progress' },
    { ...base, id: 'to3', order_number: 'ORD-TEC-000003', status: 'completed' },
    { ...base, id: 'to4', order_number: 'ORD-TEC-000004', status: 'invoiced' },
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
        React.createElement(TechnicalOrdersPage),
      ),
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useTechnicalOrdersMock.mockReturnValue({
    data: [],
    isFetching: false,
    isError: false,
  });
});

describe('TechnicalOrdersPage stat cards', () => {
  it('shows total and in-progress counts from loaded rows', () => {
    useTechnicalOrdersMock.mockReturnValue({
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

describe('TechnicalOrdersPage list', () => {
  it('renders the page heading', () => {
    renderPage();
    expect(
      screen.getByRole('heading', { name: /servicio técnico/i }),
    ).toBeInTheDocument();
  });

  it('renders empty state when no data', () => {
    renderPage();
    expect(
      screen.getByText(/no hay órdenes de servicio técnico/i),
    ).toBeInTheDocument();
  });

  it('renders the Nueva orden link pointing to /servicio-tecnico/nueva', () => {
    renderPage();
    const link = screen.getByRole('link', { name: /nueva orden/i });
    expect(link).toHaveAttribute('href', '/servicio-tecnico/nueva');
  });
});

describe('TechnicalOrdersPage status filter', () => {
  it('passes status filter to useTechnicalOrders when a status pill is clicked', async () => {
    useTechnicalOrdersMock.mockReturnValue({
      data: [],
      isFetching: false,
      isError: false,
    });

    renderPage();

    const confirmedPill = screen.getByRole('button', { name: /confirmada/i });
    await userEvent.click(confirmedPill);

    const lastCall = useTechnicalOrdersMock.mock.calls.at(-1)?.[0];
    expect(lastCall?.status).toBe('confirmed');
  });
});

describe('TechnicalOrdersPage error state', () => {
  it('shows an error message when isError is true', () => {
    useTechnicalOrdersMock.mockReturnValue({
      data: undefined,
      isFetching: false,
      isError: true,
    });

    renderPage();
    expect(screen.getByText(/error al cargar/i)).toBeInTheDocument();
  });
});
