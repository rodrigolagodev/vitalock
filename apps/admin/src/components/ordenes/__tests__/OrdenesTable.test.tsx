import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import type { ReactNode } from 'react';
import type { OrdenRow } from '@/hooks/useOrdens';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { OrdenesTable } from '../OrdenesTable';

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

const sampleOrdenes: OrdenRow[] = [
  {
    id: 'ord-1',
    order_number: 'ORD-001',
    order_type: 'keys' as const,
  client_type: 'administration',
    administration_id: 'adm-1',
    administrations: { company_name: 'Admin García S.A.' },
    particular_full_name: null,
    status: 'draft',
    created_at: '2026-08-10T12:00:00Z',
    order_items: [{ id: 'item-1' }, { id: 'item-2' }],
  },
  {
    id: 'ord-2',
    order_number: 'ORD-002',
    order_type: 'keys' as const,
  client_type: 'particular',
    administration_id: null,
    administrations: null,
    particular_full_name: 'Juan Pérez',
    status: 'in_preparation',
    created_at: '2026-08-09T08:00:00Z',
    order_items: [{ id: 'item-3' }],
  },
];

describe('OrdenesTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders skeleton rows when isFetching is true', () => {
    const { container } = render(
      <OrdenesTable ordenes={[]} isFetching={true} />,
      { wrapper: makeWrapper() },
    );

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('renders no-records empty state when no ordenes and no filters', () => {
    render(
      <OrdenesTable ordenes={[]} isFetching={false} hasFilters={false} />,
      { wrapper: makeWrapper() },
    );

    expect(screen.getByText(/no hay órdenes registradas/i)).toBeInTheDocument();
    expect(screen.queryByText(/no se encontraron órdenes/i)).not.toBeInTheDocument();
  });

  it('renders no-results empty state when no ordenes but filters active', () => {
    render(
      <OrdenesTable ordenes={[]} isFetching={false} hasFilters={true} />,
      { wrapper: makeWrapper() },
    );

    expect(screen.getByText(/no se encontraron órdenes con los filtros aplicados/i)).toBeInTheDocument();
    expect(screen.queryByText(/no hay órdenes registradas/i)).not.toBeInTheDocument();
  });

  it('renders status badge for each row', () => {
    render(
      <OrdenesTable ordenes={sampleOrdenes} isFetching={false} />,
      { wrapper: makeWrapper() },
    );

    expect(screen.getByText('Borrador')).toBeInTheDocument();
    expect(screen.getByText('En preparación')).toBeInTheDocument();
  });

  it('renders order_number as a link to /ordenes/:id', () => {
    render(
      <OrdenesTable ordenes={sampleOrdenes} isFetching={false} />,
      { wrapper: makeWrapper() },
    );

    const link1 = screen.getByRole('link', { name: 'ORD-001' });
    expect(link1).toBeInTheDocument();
    expect(link1).toHaveAttribute('href', '/ordenes/ord-1');

    const link2 = screen.getByRole('link', { name: 'ORD-002' });
    expect(link2).toBeInTheDocument();
    expect(link2).toHaveAttribute('href', '/ordenes/ord-2');
  });

  it('displays item count per row', () => {
    render(
      <OrdenesTable ordenes={sampleOrdenes} isFetching={false} />,
      { wrapper: makeWrapper() },
    );

    // ord-1 has 2 items, ord-2 has 1 item
    const cells = screen.getAllByRole('cell');
    const cellTexts = cells.map((c) => c.textContent);
    expect(cellTexts).toContain('2');
    expect(cellTexts).toContain('1');
  });

  it('displays client name: company_name for administration type', () => {
    render(
      <OrdenesTable ordenes={[sampleOrdenes[0]!]} isFetching={false} />,
      { wrapper: makeWrapper() },
    );

    expect(screen.getByText('Admin García S.A.')).toBeInTheDocument();
  });

  it('displays client name: particular_full_name for particular type', () => {
    render(
      <OrdenesTable ordenes={[sampleOrdenes[1]!]} isFetching={false} />,
      { wrapper: makeWrapper() },
    );

    expect(screen.getByText('Juan Pérez')).toBeInTheDocument();
  });
});
