import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import React from 'react';
import type { KeyOrderDetailRow } from '@/hooks/useKeyOrder';

// Hoist mock refs
const { useKeyOrderMock, useMutateKeyOrderMock, mockNavigate } = vi.hoisted(() => ({
  useKeyOrderMock: vi.fn(),
  useMutateKeyOrderMock: vi.fn(),
  mockNavigate: vi.fn(),
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/hooks/useKeyOrder', () => ({ useKeyOrder: useKeyOrderMock }));
vi.mock('@/hooks/useMutateKeyOrder', () => ({
  useMutateKeyOrder: useMutateKeyOrderMock,
}));

// Stub the form — tests focus on page-level guard and navigation
vi.mock('@/components/llaves/KeyOrderForm', () => ({
  KeyOrderForm: ({
    mode,
    onSubmit,
  }: {
    mode: string;
    onSubmit: (values: unknown) => Promise<void>;
  }) => (
    <div data-testid="key-order-form" data-mode={mode}>
      <button
        type="button"
        data-testid="stub-submit"
        onClick={() =>
          void onSubmit({
            client_type: 'administration',
            administration_id: 'adm-1',
            particular_id: null,
            particular_full_name: '',
            particular_dni: '',
            particular_phone: '',
            particular_email: '',
            notes: '',
            items: [
              {
                item_type: 'key',
                quantity: 1,
                description: '',
                building_id: 'bld-1',
                unit_price: 100,
                unit_id: null,
                pickup_particular_id: null,
                product_id: 'prod-1',
              },
            ],
          })
        }
      >
        Guardar cambios
      </button>
    </div>
  ),
}));

import KeyOrderEditarPage from '../KeyOrderEditarPage';

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
    status: 'draft',
    notes: null,
    created_at: '2026-08-10T12:00:00Z',
    updated_at: '2026-08-10T12:01:00Z',
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
        product_id: 'prod-1',
        produced_key_id: null,
        pickup_particular_id: null,
        pickup_particulares: null,
        rfid_keys: null,
      },
    ],
    ...overrides,
  };
}

const updateDraftMutateAsync = vi.fn();

const defaultMutations = {
  createKeyOrder: { mutate: vi.fn(), isPending: false },
  confirmKeyOrder: { mutate: vi.fn(), isPending: false },
  cancelKeyOrder: { mutate: vi.fn(), isPending: false },
  updateDraftKeyOrder: {
    mutateAsync: updateDraftMutateAsync,
    isPending: false,
  },
  markKeyOrderInvoiced: { mutate: vi.fn(), isPending: false },
  setKeyOrderPickupPerson: { mutate: vi.fn(), isPending: false },
  configureKeyOrderItem: { mutate: vi.fn(), isPending: false },
};

function renderPage(keyOrderId = 'ko-1') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/llaves/${keyOrderId}/editar`]}>
        <Routes>
          <Route
            path="/llaves/:keyOrderId/editar"
            element={<KeyOrderEditarPage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('KeyOrderEditarPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useMutateKeyOrderMock.mockReturnValue(defaultMutations);
  });

  // T-13c-3a: renders form when order is draft
  it('renders KeyOrderForm in edit mode when order is draft', () => {
    useKeyOrderMock.mockReturnValue({
      data: makeOrder({ status: 'draft' }),
      isLoading: false,
      isError: false,
    });
    renderPage();
    expect(screen.getByTestId('key-order-form')).toBeInTheDocument();
    expect(screen.getByTestId('key-order-form')).toHaveAttribute('data-mode', 'edit');
  });

  // T-13c-3b: shows error guard when order is confirmed (not draft)
  it('shows error message for confirmed order (draft-only guard)', () => {
    useKeyOrderMock.mockReturnValue({
      data: makeOrder({ status: 'confirmed' }),
      isLoading: false,
      isError: false,
    });
    renderPage();
    expect(
      screen.getByText(/esta orden no puede editarse porque no está en estado borrador/i),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('key-order-form')).not.toBeInTheDocument();
    // Should show a "Volver al detalle" button
    expect(screen.getByRole('button', { name: /volver al detalle/i })).toBeInTheDocument();
  });

  // T-13c-3c: loading state
  it('renders loading skeleton while order is loading', () => {
    useKeyOrderMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });
    renderPage();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  // T-13c-3d: successful submit navigates to detail page
  it('navigates to detail page after successful edit submit', async () => {
    const user = userEvent.setup();
    updateDraftMutateAsync.mockResolvedValue('2026-08-10T12:02:00Z');
    useKeyOrderMock.mockReturnValue({
      data: makeOrder({ status: 'draft' }),
      isLoading: false,
      isError: false,
    });
    renderPage();

    const submitBtn = screen.getByTestId('stub-submit');
    await user.click(submitBtn);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/llaves/ko-1');
    });
  });

  // T-13c-3e: "Volver al detalle" button on non-draft navigates to detail
  it('clicking "Volver al detalle" navigates to the detail page', async () => {
    const user = userEvent.setup();
    useKeyOrderMock.mockReturnValue({
      data: makeOrder({ status: 'in_progress' }),
      isLoading: false,
      isError: false,
    });
    renderPage();

    const backBtn = screen.getByRole('button', { name: /volver al detalle/i });
    await user.click(backBtn);

    expect(mockNavigate).toHaveBeenCalledWith('/llaves/ko-1');
  });
});
