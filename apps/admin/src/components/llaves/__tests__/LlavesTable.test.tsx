import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import type { ReactNode } from 'react';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { LlavesTable } from '../LlavesTable';
import type { KeyOrderListRow } from '@/hooks/useKeyOrders';

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(
      MemoryRouter,
      null,
      React.createElement(QueryClientProvider, { client: queryClient }, children),
    );
  };
}

const sampleRows: KeyOrderListRow[] = [
  {
    id: 'ko-1',
    order_number: 'ORD-LLV-000001',
    client_type: 'administration',
    administration_id: 'adm-1',
    administrations: { company_name: 'Consorcio ABC' },
    particular_full_name: null,
    status: 'confirmed',
    created_at: '2026-08-10T12:00:00Z',
    key_order_items: [{ id: 'item-1' }, { id: 'item-2' }],
  },
  {
    id: 'ko-2',
    order_number: 'ORD-LLV-000002',
    client_type: 'particular',
    administration_id: null,
    administrations: null,
    particular_full_name: 'María García',
    status: 'ready_for_pickup',
    created_at: '2026-08-09T08:00:00Z',
    key_order_items: [{ id: 'item-3' }],
  },
];

describe('LlavesTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders skeleton rows when isFetching is true', () => {
    const { container } = render(
      <LlavesTable rows={[]} isFetching={true} />,
      { wrapper: makeWrapper() },
    );

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('renders empty state message when no rows and no filters', () => {
    render(
      <LlavesTable rows={[]} isFetching={false} hasFilters={false} />,
      { wrapper: makeWrapper() },
    );

    expect(screen.getByText(/no hay órdenes de llave/i)).toBeInTheDocument();
  });

  it('renders filtered-empty-state when no rows but filters active', () => {
    render(
      <LlavesTable rows={[]} isFetching={false} hasFilters={true} />,
      { wrapper: makeWrapper() },
    );

    expect(
      screen.getByText(/no se encontraron órdenes con los filtros/i),
    ).toBeInTheDocument();
  });

  it('renders status badge for each row', () => {
    render(<LlavesTable rows={sampleRows} isFetching={false} />, {
      wrapper: makeWrapper(),
    });

    // 'confirmed' → 'Confirmada', 'ready_for_pickup' → 'Lista para retirar'
    expect(screen.getByText('Confirmada')).toBeInTheDocument();
    expect(screen.getByText('Lista para retirar')).toBeInTheDocument();
  });

  it('renders order_number as a link to /llaves/:id', () => {
    render(<LlavesTable rows={sampleRows} isFetching={false} />, {
      wrapper: makeWrapper(),
    });

    const link1 = screen.getByRole('link', { name: 'ORD-LLV-000001' });
    expect(link1).toHaveAttribute('href', '/llaves/ko-1');

    const link2 = screen.getByRole('link', { name: 'ORD-LLV-000002' });
    expect(link2).toHaveAttribute('href', '/llaves/ko-2');
  });
});
