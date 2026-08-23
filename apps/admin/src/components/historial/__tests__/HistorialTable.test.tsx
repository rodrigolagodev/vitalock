import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import type { ReactNode } from 'react';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { HistorialTable } from '../HistorialTable';
import type { AllOrderRow } from '@/hooks/useAllOrders';

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

const sampleRows: AllOrderRow[] = [
  {
    id: 'ko-1',
    order_number: 'ORD-LLV-000001',
    order_kind: 'key',
    client_type: 'administration',
    administration_id: 'adm-1',
    particular_id: null,
    particular_full_name: null,
    status: 'invoiced',
    notes: null,
    created_at: '2026-08-10T12:00:00Z',
    updated_at: '2026-08-10T12:00:00Z',
  },
  {
    id: 'to-1',
    order_number: 'ORD-TEC-000001',
    order_kind: 'technical',
    client_type: 'particular',
    administration_id: null,
    particular_id: 'part-1',
    particular_full_name: 'Juan Pérez',
    status: 'in_progress',
    notes: null,
    created_at: '2026-08-09T08:00:00Z',
    updated_at: '2026-08-09T08:00:00Z',
  },
];

describe('HistorialTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders skeleton rows when isFetching is true', () => {
    const { container } = render(
      <HistorialTable orders={[]} isFetching={true} hasFilters={false} />,
      { wrapper: makeWrapper() },
    );

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('renders empty state message when no rows and no filters', () => {
    render(
      <HistorialTable orders={[]} isFetching={false} hasFilters={false} />,
      { wrapper: makeWrapper() },
    );

    expect(screen.getByText(/no hay órdenes en el historial/i)).toBeInTheDocument();
  });

  it('renders filtered-empty-state when no rows but filters active', () => {
    render(
      <HistorialTable orders={[]} isFetching={false} hasFilters={true} />,
      { wrapper: makeWrapper() },
    );

    expect(
      screen.getByText(/no se encontraron órdenes con los filtros/i),
    ).toBeInTheDocument();
  });

  it('renders order_kind badge: key → "Llaves", technical → "Servicio técnico"', () => {
    render(<HistorialTable orders={sampleRows} isFetching={false} hasFilters={false} />, {
      wrapper: makeWrapper(),
    });

    expect(screen.getByText('Llaves')).toBeInTheDocument();
    expect(screen.getByText('Servicio técnico')).toBeInTheDocument();
  });

  it('renders correct href: /llaves/:id for key, /servicio-tecnico/:id for technical', () => {
    render(<HistorialTable orders={sampleRows} isFetching={false} hasFilters={false} />, {
      wrapper: makeWrapper(),
    });

    const link1 = screen.getByRole('link', { name: 'ORD-LLV-000001' });
    expect(link1).toHaveAttribute('href', '/llaves/ko-1');

    const link2 = screen.getByRole('link', { name: 'ORD-TEC-000001' });
    expect(link2).toHaveAttribute('href', '/servicio-tecnico/to-1');
  });
});
