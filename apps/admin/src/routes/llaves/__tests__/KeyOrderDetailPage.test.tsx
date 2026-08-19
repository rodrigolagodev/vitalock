import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import React from 'react';
import type { KeyOrderDetailRow } from '@/hooks/useKeyOrder';

// Hoist mocks for vi.mock hoisting requirement
const { useKeyOrderMock, useMutateKeyOrderMock } = vi.hoisted(() => ({
  useKeyOrderMock: vi.fn(),
  useMutateKeyOrderMock: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/hooks/useKeyOrder', () => ({ useKeyOrder: useKeyOrderMock }));
vi.mock('@/hooks/useMutateKeyOrder', () => ({
  useMutateKeyOrder: useMutateKeyOrderMock,
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
// Stub items table to avoid deep dependency chain in detail page tests
vi.mock('@/components/llaves/KeyOrderItemsTable', () => ({
  KeyOrderItemsTable: () => <div data-testid="items-table" />,
}));

import KeyOrderDetailPage from '../KeyOrderDetailPage';

const cancelMutate = vi.fn();
const markInvoicedMutate = vi.fn();

const defaultMutations = {
  cancelKeyOrder: { mutate: cancelMutate, isPending: false },
  markKeyOrderInvoiced: { mutate: markInvoicedMutate, isPending: false },
  configureKeyOrderItem: { mutate: vi.fn(), isPending: false },
  setKeyOrderPickupPerson: { mutate: vi.fn(), isPending: false },
  createKeyOrder: { mutate: vi.fn(), isPending: false },
  confirmKeyOrder: { mutate: vi.fn(), isPending: false },
  updateDraftKeyOrder: { mutate: vi.fn(), isPending: false },
};

function makeOrder(overrides: Partial<KeyOrderDetailRow> = {}): KeyOrderDetailRow {
  return {
    id: 'ko-1',
    order_number: 'ORD-LLV-000001',
    client_type: 'administration',
    administration_id: 'adm-1',
    administrations: { company_name: 'Consorcio Test' },
    particular_id: null,
    pickup_particular_id: null,
    particulares: null,
    particular_full_name: null,
    particular_dni: null,
    particular_phone: null,
    particular_email: null,
    status: 'confirmed',
    notes: null,
    created_at: '2026-08-10T12:00:00Z',
    updated_at: '2026-08-10T12:00:00Z',
    key_order_items: [
      {
        id: 'item-1',
        order_id: 'ko-1',
        item_type: 'key',
        quantity: 1,
        description: null,
        status: 'pending',
        building_id: 'bld-1',
        unit_id: null,
        unit_price: 100,
        product_id: null,
        produced_key_id: null,
        pickup_particular_id: null,
        pickup_particulares: null,
        rfid_keys: null,
      },
    ],
    ...overrides,
  };
}

function renderPage(keyOrderId = 'ko-1') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <MemoryRouter initialEntries={[`/llaves/${keyOrderId}`]}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/llaves/:keyOrderId" element={<KeyOrderDetailPage />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useMutateKeyOrderMock.mockReturnValue(defaultMutations);
  useKeyOrderMock.mockReturnValue({
    data: makeOrder(),
    isLoading: false,
    isError: false,
  });
});

describe('KeyOrderDetailPage — header', () => {
  it('renders order_number and status badge', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: /ORD-LLV-000001/i })).toBeInTheDocument();
    // Confirmed badge
    expect(screen.getByText('Confirmada')).toBeInTheDocument();
  });

  it('renders administration client info', () => {
    renderPage();
    expect(screen.getByText(/Consorcio Test/i)).toBeInTheDocument();
  });

  it('renders particular client info', () => {
    useKeyOrderMock.mockReturnValue({
      data: makeOrder({
        client_type: 'particular',
        administration_id: null,
        administrations: null,
        particular_full_name: 'María García',
        particular_dni: '28123456',
      }),
      isLoading: false,
      isError: false,
    });

    renderPage();
    expect(screen.getByText(/María García/i)).toBeInTheDocument();
    expect(screen.getByText(/28123456/i)).toBeInTheDocument();
  });

  it('renders breadcrumb link to /llaves', () => {
    renderPage();
    const breadcrumb = screen.getByRole('link', { name: /llaves/i });
    expect(breadcrumb).toHaveAttribute('href', '/llaves');
  });
});

describe('KeyOrderDetailPage — action buttons', () => {
  it('shows cancel button when order is not terminal', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /cancelar/i })).toBeInTheDocument();
  });

  it('cancel button fires cancelKeyOrder mutation', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));
    expect(cancelMutate).toHaveBeenCalledWith({ id: 'ko-1' });
  });

  it('shows mark-invoiced button only when status=completed', () => {
    useKeyOrderMock.mockReturnValue({
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
    useKeyOrderMock.mockReturnValue({
      data: makeOrder({ status: 'draft' }),
      isLoading: false,
      isError: false,
    });
    renderPage();
    const editLink = screen.getByRole('link', { name: /editar/i });
    expect(editLink).toHaveAttribute('href', '/llaves/ko-1/editar');
  });

  it('does NOT show edit link when status is not draft', () => {
    renderPage(); // status=confirmed
    expect(screen.queryByRole('link', { name: /editar/i })).not.toBeInTheDocument();
  });

  it('hides cancel button when status is terminal', () => {
    useKeyOrderMock.mockReturnValue({
      data: makeOrder({ status: 'cancelled' }),
      isLoading: false,
      isError: false,
    });
    renderPage();
    expect(screen.queryByRole('button', { name: /cancelar/i })).not.toBeInTheDocument();
  });
});

describe('KeyOrderDetailPage — items table', () => {
  it('renders the items section heading', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: /ítems/i })).toBeInTheDocument();
  });
});

describe('KeyOrderDetailPage — loading and error states', () => {
  it('shows loading skeleton', () => {
    useKeyOrderMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });
    const { container } = renderPage();
    expect(container.querySelector('.animate-pulse')).not.toBeNull();
  });

  it('shows error message', () => {
    useKeyOrderMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });
    renderPage();
    expect(screen.getByText(/error al cargar/i)).toBeInTheDocument();
  });
});
