import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import type { ReactNode } from 'react';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { ServicioTecnicoTable } from '../ServicioTecnicoTable';
import type { TechnicalOrderListRow } from '@/hooks/useTechnicalOrders';

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

const sampleRows: TechnicalOrderListRow[] = [
  {
    id: 'to-1',
    order_number: 'ORD-TEC-000001',
    client_type: 'administration',
    administration_id: 'adm-1',
    administrations: { company_name: 'Consorcio XYZ' },
    particular_full_name: null,
    status: 'confirmed',
    created_at: '2026-08-10T12:00:00Z',
    technical_order_items: [{ id: 'ti-1' }, { id: 'ti-2' }],
  },
  {
    id: 'to-2',
    order_number: 'ORD-TEC-000002',
    client_type: 'particular',
    administration_id: null,
    administrations: null,
    particular_full_name: 'Juan Pérez',
    status: 'in_progress',
    created_at: '2026-08-09T08:00:00Z',
    technical_order_items: [{ id: 'ti-3' }],
  },
];

describe('ServicioTecnicoTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders skeleton rows when isFetching is true', () => {
    const { container } = render(
      <ServicioTecnicoTable rows={[]} isFetching={true} />,
      { wrapper: makeWrapper() },
    );

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('renders empty state message when no rows and no filters', () => {
    render(
      <ServicioTecnicoTable rows={[]} isFetching={false} hasFilters={false} />,
      { wrapper: makeWrapper() },
    );

    expect(screen.getByText(/no hay órdenes de servicio técnico/i)).toBeInTheDocument();
  });

  it('renders filtered-empty-state when no rows but filters active', () => {
    render(
      <ServicioTecnicoTable rows={[]} isFetching={false} hasFilters={true} />,
      { wrapper: makeWrapper() },
    );

    expect(
      screen.getByText(/no se encontraron órdenes con los filtros/i),
    ).toBeInTheDocument();
  });

  it('renders status badge for each row', () => {
    render(<ServicioTecnicoTable rows={sampleRows} isFetching={false} />, {
      wrapper: makeWrapper(),
    });

    // 'confirmed' → 'Confirmada', 'in_progress' → 'En proceso'
    expect(screen.getByText('Confirmada')).toBeInTheDocument();
    expect(screen.getByText('En proceso')).toBeInTheDocument();
  });

  it('renders order_number as a link to /servicio-tecnico/:id', () => {
    render(<ServicioTecnicoTable rows={sampleRows} isFetching={false} />, {
      wrapper: makeWrapper(),
    });

    const link1 = screen.getByRole('link', { name: 'ORD-TEC-000001' });
    expect(link1).toHaveAttribute('href', '/servicio-tecnico/to-1');

    const link2 = screen.getByRole('link', { name: 'ORD-TEC-000002' });
    expect(link2).toHaveAttribute('href', '/servicio-tecnico/to-2');
  });
});
