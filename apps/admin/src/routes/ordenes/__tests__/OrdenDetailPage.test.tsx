import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import React from 'react';
import type { ReactNode } from 'react';

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

// Mock useOrden
const mockUseOrden = vi.fn();
vi.mock('@/hooks/useOrden', () => ({
  useOrden: (id: string) => mockUseOrden(id),
}));

// Mock useOrderTareas
vi.mock('@/hooks/useOrderTareas', () => ({
  useOrderTareas: () => ({ data: [], isLoading: false }),
}));

// Mock the three table components as markers so the composition tests assert
// which tables the page renders without pulling in their component trees
// (OrderItemsTable carries supabase deps; the two new tables have their own suites).
vi.mock('@/components/ordenes/OrderItemsTable', () => ({
  OrderItemsTable: () => <div data-testid="table-order-items" />,
}));

vi.mock('@/components/ordenes/TechnicalItemsTable', () => ({
  TechnicalItemsTable: () => <div data-testid="table-technical-items" />,
}));

vi.mock('@/components/ordenes/OrderTareasTable', () => ({
  OrderTareasTable: () => <div data-testid="table-order-tareas" />,
}));

// Mock useMutateOrden — all mutate fns captured as module-level vi.fn()
const mockConfirmOrden = vi.fn();
const mockCancelOrden = vi.fn();
const mockMarkOrderInvoiced = vi.fn();
vi.mock('@/hooks/useMutateOrden', () => ({
  useMutateOrden: () => ({
    confirmOrden: {
      mutate: mockConfirmOrden,
      isPending: false,
    },
    cancelOrden: {
      mutate: mockCancelOrden,
      isPending: false,
    },
    markOrderInvoiced: {
      mutate: mockMarkOrderInvoiced,
      isPending: false,
    },
    updateDraftOrden: { mutateAsync: vi.fn(), isPending: false },
    createOrden: { mutateAsync: vi.fn(), isPending: false },
  }),
}));

import OrdenDetailPage from '../OrdenDetailPage';

const baseOrden = {
  id: 'ord-1',
  order_number: 'ORD-001',
  order_type: 'keys' as const,
  client_type: 'administration' as const,
  administration_id: 'adm-1',
  administrations: { company_name: 'Admin García S.A.' },
  particular_id: null,
  pickup_particular_id: null,
  particulares: null,
  particular_full_name: null,
  particular_dni: null,
  particular_phone: null,
  particular_email: null,
  notes: null,
  created_at: '2026-08-10T12:00:00Z',
  updated_at: '2026-08-10T12:00:00Z',
  order_items: [],
};

function makeWrapper(initialPath = '/ordenes/ord-1') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(
        MemoryRouter,
        { initialEntries: [initialPath] },
        React.createElement(
          Routes,
          null,
          React.createElement(Route, {
            path: '/ordenes/:ordenId',
            element: children,
          }),
        ),
      ),
    );
  };
}

describe('OrdenDetailPage — action bar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // T-23a: draft shows Editar link, Confirmar orden, and Cancelar orden; hides Iniciar preparación
  it('shows Editar, Confirmar orden, and Cancelar orden for draft orders', () => {
    mockUseOrden.mockReturnValue({
      data: { ...baseOrden, status: 'draft' },
      isLoading: false,
      isError: false,
    });

    render(<OrdenDetailPage />, { wrapper: makeWrapper() });

    expect(screen.getByRole('link', { name: /editar/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /confirmar orden/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancelar orden/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /iniciar preparaci/i })).not.toBeInTheDocument();
  });

  // T-23b: confirmed status shows only Cancelar orden; hides Editar and Confirmar orden
  it('shows only Cancelar orden for confirmed orders', () => {
    mockUseOrden.mockReturnValue({
      data: { ...baseOrden, status: 'confirmed' },
      isLoading: false,
      isError: false,
    });

    render(<OrdenDetailPage />, { wrapper: makeWrapper() });

    expect(screen.queryByRole('link', { name: /editar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /confirmar orden/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancelar orden/i })).toBeInTheDocument();
  });

  // T-23c: Confirmar orden click calls confirmOrden.mutate with order id
  it('calls confirmOrden.mutate when Confirmar orden is clicked', async () => {
    const user = userEvent.setup();
    mockUseOrden.mockReturnValue({
      data: { ...baseOrden, status: 'draft' },
      isLoading: false,
      isError: false,
    });

    render(<OrdenDetailPage />, { wrapper: makeWrapper() });

    const confirmBtn = screen.getByRole('button', { name: /confirmar orden/i });
    await user.click(confirmBtn);

    expect(mockConfirmOrden).toHaveBeenCalledWith({ id: 'ord-1' });
  });

  // Extra: in_progress shows only Cancelar orden (same as confirmed)
  it('shows only Cancelar orden for in_progress orders', () => {
    mockUseOrden.mockReturnValue({
      data: { ...baseOrden, status: 'in_progress' },
      isLoading: false,
      isError: false,
    });

    render(<OrdenDetailPage />, { wrapper: makeWrapper() });

    expect(screen.queryByRole('link', { name: /editar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /confirmar orden/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancelar orden/i })).toBeInTheDocument();
  });

  // Extra: completed shows Marcar facturada (no cancel)
  it('shows Marcar facturada and no Cancelar orden for completed orders', () => {
    mockUseOrden.mockReturnValue({
      data: { ...baseOrden, status: 'completed' },
      isLoading: false,
      isError: false,
    });

    render(<OrdenDetailPage />, { wrapper: makeWrapper() });

    expect(screen.getByRole('button', { name: /marcar facturada/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cancelar orden/i })).not.toBeInTheDocument();
  });
});

describe('OrdenDetailPage — three-table composition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // T-22a: keys orders compose only OrderItemsTable; the technical tables stay out
  it('composes OrderItemsTable for keys orders (no technical tables)', () => {
    mockUseOrden.mockReturnValue({
      data: { ...baseOrden, order_type: 'keys' },
      isLoading: false,
      isError: false,
    });

    render(<OrdenDetailPage />, { wrapper: makeWrapper() });

    expect(screen.getByTestId('table-order-items')).toBeInTheDocument();
    expect(screen.queryByTestId('table-technical-items')).not.toBeInTheDocument();
    expect(screen.queryByTestId('table-order-tareas')).not.toBeInTheDocument();
  });

  // T-22b: technical orders compose TechnicalItemsTable + OrderTareasTable, no OrderItemsTable
  it('composes TechnicalItemsTable and OrderTareasTable for technical orders', () => {
    mockUseOrden.mockReturnValue({
      data: { ...baseOrden, order_type: 'technical' },
      isLoading: false,
      isError: false,
    });

    render(<OrdenDetailPage />, { wrapper: makeWrapper() });

    expect(screen.getByTestId('table-technical-items')).toBeInTheDocument();
    expect(screen.getByTestId('table-order-tareas')).toBeInTheDocument();
    expect(screen.queryByTestId('table-order-items')).not.toBeInTheDocument();
  });
});
