import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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

function makeOrdenes(count: number): OrdenRow[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `ord-${i + 1}`,
    order_number: `ORD-${String(i + 1).padStart(3, '0')}`,
    order_type: 'keys' as const,
    client_type: 'particular',
    administration_id: null,
    administrations: null,
    particular_full_name: `Cliente ${i + 1}`,
    status: 'confirmed',
    created_at: '2026-08-10T12:00:00Z',
    order_items: [{ id: `item-${i + 1}` }],
  }));
}

describe('OrdenesTable pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders only the first 10 rows with the pagination footer', () => {
    render(<OrdenesTable ordenes={makeOrdenes(25)} isFetching={false} />, {
      wrapper: makeWrapper(),
    });

    expect(screen.getByText('1–10 de 25')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(11); // 1 header + 10 body rows
    expect(screen.queryByText('ORD-011')).not.toBeInTheDocument();
  });

  it('pages forward and backward within the dataset', () => {
    render(<OrdenesTable ordenes={makeOrdenes(25)} isFetching={false} />, {
      wrapper: makeWrapper(),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));
    expect(screen.getByText('11–20 de 25')).toBeInTheDocument();
    expect(screen.getByText('ORD-011')).toBeInTheDocument();
    expect(screen.queryByText('ORD-001')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Página anterior' }));
    expect(screen.getByText('1–10 de 25')).toBeInTheDocument();
    expect(screen.getByText('ORD-001')).toBeInTheDocument();
  });

  it('resets page and rows-per-page when the filtered dataset changes', () => {
    const { rerender } = render(
      <OrdenesTable ordenes={makeOrdenes(25)} isFetching={false} />,
      { wrapper: makeWrapper() },
    );

    fireEvent.change(screen.getByRole('combobox'), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));
    expect(screen.getByText('21–25 de 25')).toBeInTheDocument();

    rerender(<OrdenesTable ordenes={makeOrdenes(3)} isFetching={false} />);

    expect(screen.getByText('1–3 de 3')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveValue('10');
    expect(screen.getByText('ORD-001')).toBeInTheDocument();
  });

  it('changes the page size and clamps back to the first page', () => {
    render(<OrdenesTable ordenes={makeOrdenes(25)} isFetching={false} />, {
      wrapper: makeWrapper(),
    });

    fireEvent.change(screen.getByRole('combobox'), { target: { value: '50' } });
    expect(screen.getByText('1–25 de 25')).toBeInTheDocument();
  });
});
