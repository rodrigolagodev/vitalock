import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import React from 'react';
import type { TechnicalOrderDetailRow } from '@/hooks/useTechnicalOrder';

// Hoist mocks for vi.mock hoisting requirement
const { useTechnicalOrderMock, useMutateTechnicalOrderMock, useTechnicalOrderTicketsMock } = vi.hoisted(() => ({
  useTechnicalOrderMock: vi.fn(),
  useMutateTechnicalOrderMock: vi.fn(),
  useTechnicalOrderTicketsMock: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/hooks/useTechnicalOrder', () => ({ useTechnicalOrder: useTechnicalOrderMock }));
vi.mock('@/hooks/useMutateTechnicalOrder', () => ({
  useMutateTechnicalOrder: useMutateTechnicalOrderMock,
}));
vi.mock('@/hooks/useTechnicalOrderTickets', () => ({
  useTechnicalOrderTickets: useTechnicalOrderTicketsMock,
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
// Stub items table and linked tickets to avoid deep dependency chains
vi.mock('@/components/servicio-tecnico/TechnicalOrderItemsTable', () => ({
  TechnicalOrderItemsTable: () => <div data-testid="items-table" />,
}));
vi.mock('@/components/servicio-tecnico/LinkedTicketsTable', () => ({
  LinkedTicketsTable: () => <div data-testid="linked-tickets-table" />,
}));

import TechnicalOrderDetailPage from '../TechnicalOrderDetailPage';

const cancelMutate = vi.fn();
const markInvoicedMutate = vi.fn();

const defaultMutations = {
  cancelTechnicalOrder: { mutate: cancelMutate, isPending: false },
  markTechnicalOrderInvoiced: { mutate: markInvoicedMutate, isPending: false },
  createTechnicalOrder: { mutate: vi.fn(), isPending: false },
  confirmTechnicalOrder: { mutate: vi.fn(), isPending: false },
  updateDraftTechnicalOrder: { mutate: vi.fn(), isPending: false },
  recomputeTechnicalOrderStatus: { mutate: vi.fn(), isPending: false },
};

function makeOrder(overrides: Partial<TechnicalOrderDetailRow> = {}): TechnicalOrderDetailRow {
  return {
    id: 'to-1',
    order_number: 'ORD-TEC-000001',
    client_type: 'administration',
    administration_id: 'adm-1',
    administrations: { company_name: 'Consorcio Test' },
    particular_id: null,
    particulares: null,
    particular_full_name: null,
    particular_dni: null,
    particular_phone: null,
    particular_email: null,
    status: 'confirmed',
    notes: null,
    created_at: '2026-08-10T12:00:00Z',
    updated_at: '2026-08-10T12:00:00Z',
    technical_order_items: [
      {
        id: 'item-1',
        order_id: 'to-1',
        item_type: 'maintenance',
        quantity: 1,
        description: 'Revision sistema',
        status: 'pending',
        building_id: 'bld-1',
        unit_price: 500,
        product_id: null,
        intended_equipment_id: 'eq-1',
        intended_assignee_staff_id: 'staff-1',
      },
    ],
    ...overrides,
  };
}

function renderPage(techOrderId = 'to-1') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <MemoryRouter initialEntries={[`/servicio-tecnico/${techOrderId}`]}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/servicio-tecnico/:techOrderId" element={<TechnicalOrderDetailPage />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useMutateTechnicalOrderMock.mockReturnValue(defaultMutations);
  useTechnicalOrderMock.mockReturnValue({
    data: makeOrder(),
    isLoading: false,
    isError: false,
  });
  useTechnicalOrderTicketsMock.mockReturnValue({
    data: [],
    isLoading: false,
    isError: false,
  });
});

describe('TechnicalOrderDetailPage — header', () => {
  it('renders order_number and status badge', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: /ORD-TEC-000001/i })).toBeInTheDocument();
    expect(screen.getByText('Confirmada')).toBeInTheDocument();
  });

  it('renders administration client info', () => {
    renderPage();
    expect(screen.getByText(/Consorcio Test/i)).toBeInTheDocument();
  });

  it('renders particular client info', () => {
    useTechnicalOrderMock.mockReturnValue({
      data: makeOrder({
        client_type: 'particular',
        administration_id: null,
        administrations: null,
        particular_full_name: 'Juan Pérez',
        particular_dni: '29876543',
      }),
      isLoading: false,
      isError: false,
    });

    renderPage();
    expect(screen.getByText(/Juan Pérez/i)).toBeInTheDocument();
    expect(screen.getByText(/29876543/i)).toBeInTheDocument();
  });

  it('renders breadcrumb link to /servicio-tecnico', () => {
    renderPage();
    const breadcrumb = screen.getByRole('link', { name: /servicio técnico/i });
    expect(breadcrumb).toHaveAttribute('href', '/servicio-tecnico');
  });
});

describe('TechnicalOrderDetailPage — action buttons', () => {
  it('shows cancel button when order is not terminal', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /cancelar/i })).toBeInTheDocument();
  });

  it('cancel button fires cancelTechnicalOrder mutation', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));
    expect(cancelMutate).toHaveBeenCalledWith({ id: 'to-1' });
  });

  it('shows mark-invoiced button only when status=completed', () => {
    useTechnicalOrderMock.mockReturnValue({
      data: makeOrder({ status: 'completed' }),
      isLoading: false,
      isError: false,
    });
    renderPage();
    expect(screen.getByRole('button', { name: /facturada/i })).toBeInTheDocument();
  });

  it('does NOT show mark-invoiced when status is not completed', () => {
    renderPage(); // status=confirmed
    expect(screen.queryByRole('button', { name: /facturada/i })).not.toBeInTheDocument();
  });

  it('shows edit link when status=draft', () => {
    useTechnicalOrderMock.mockReturnValue({
      data: makeOrder({ status: 'draft' }),
      isLoading: false,
      isError: false,
    });
    renderPage();
    const editLink = screen.getByRole('link', { name: /editar/i });
    expect(editLink).toHaveAttribute('href', '/servicio-tecnico/to-1/editar');
  });

  it('does NOT show edit link when status is not draft', () => {
    renderPage(); // status=confirmed
    expect(screen.queryByRole('link', { name: /editar/i })).not.toBeInTheDocument();
  });

  it('hides cancel button when status is terminal (cancelled)', () => {
    useTechnicalOrderMock.mockReturnValue({
      data: makeOrder({ status: 'cancelled' }),
      isLoading: false,
      isError: false,
    });
    renderPage();
    expect(screen.queryByRole('button', { name: /cancelar/i })).not.toBeInTheDocument();
  });
});

describe('TechnicalOrderDetailPage — items section', () => {
  it('renders the items section heading', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: /ítems/i })).toBeInTheDocument();
  });

  it('renders the TechnicalOrderItemsTable stub', () => {
    renderPage();
    expect(screen.getByTestId('items-table')).toBeInTheDocument();
  });
});

describe('TechnicalOrderDetailPage — linked tickets section', () => {
  it('renders the tickets section heading', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: /tickets/i })).toBeInTheDocument();
  });

  it('renders the LinkedTicketsTable stub', () => {
    renderPage();
    expect(screen.getByTestId('linked-tickets-table')).toBeInTheDocument();
  });
});

describe('TechnicalOrderDetailPage — loading and error states', () => {
  it('shows loading skeleton', () => {
    useTechnicalOrderMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });
    const { container } = renderPage();
    expect(container.querySelector('.animate-pulse')).not.toBeNull();
  });

  it('shows error message', () => {
    useTechnicalOrderMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });
    renderPage();
    expect(screen.getByText(/error al cargar/i)).toBeInTheDocument();
  });
});
