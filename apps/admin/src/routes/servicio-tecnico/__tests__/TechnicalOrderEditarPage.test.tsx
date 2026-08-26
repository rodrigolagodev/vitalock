import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import React from 'react';
import type { TechnicalOrderDetailRow } from '@/hooks/useTechnicalOrder';

// Hoist mock refs
const { useTechnicalOrderMock, useMutateTechnicalOrderMock, mockNavigate } = vi.hoisted(() => ({
  useTechnicalOrderMock: vi.fn(),
  useMutateTechnicalOrderMock: vi.fn(),
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
vi.mock('@/hooks/useTechnicalOrder', () => ({ useTechnicalOrder: useTechnicalOrderMock }));
vi.mock('@/hooks/useMutateTechnicalOrder', () => ({
  useMutateTechnicalOrder: useMutateTechnicalOrderMock,
}));

// Stub the form — tests focus on page-level guard and navigation
vi.mock('@/components/servicio-tecnico/TechnicalOrderForm', () => ({
  TechnicalOrderForm: ({
    mode,
    onSubmit,
  }: {
    mode: string;
    onSubmit: (values: unknown) => Promise<void>;
  }) => (
    <div data-testid="technical-order-form" data-mode={mode}>
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
                item_type: 'maintenance',
                quantity: 1,
                description: '',
                building_id: 'bld-1',
                unit_price: null,
                product_id: null,
                intended_equipment_id: 'equip-1',
                intended_replacement_equipment_id: null,
                intended_assignee_staff_id: 'staff-1',
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

import TechnicalOrderEditarPage from '../TechnicalOrderEditarPage';

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
    status: 'draft',
    notes: null,
    created_at: '2026-08-10T12:00:00Z',
    updated_at: '2026-08-10T12:01:00Z',
    technical_order_items: [
      {
        id: 'item-1',
        order_id: 'to-1',
        item_type: 'maintenance',
        quantity: 1,
        description: null,
        status: 'pending',
        building_id: 'bld-1',
        unit_price: null,
        product_id: null,
        intended_equipment_id: 'equip-1',
        intended_replacement_equipment_id: null,
        intended_assignee_staff_id: 'staff-1',
      },
    ],
    ...overrides,
  };
}

const updateDraftMutateAsync = vi.fn();

const defaultMutations = {
  createTechnicalOrder: { mutate: vi.fn(), isPending: false },
  confirmTechnicalOrder: { mutate: vi.fn(), isPending: false },
  cancelTechnicalOrder: { mutate: vi.fn(), isPending: false },
  updateDraftTechnicalOrder: {
    mutateAsync: updateDraftMutateAsync,
    isPending: false,
  },
  markTechnicalOrderInvoiced: { mutate: vi.fn(), isPending: false },
  recomputeTechnicalOrderStatus: { mutate: vi.fn(), isPending: false },
};

function renderPage(techOrderId = 'to-1') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/servicio-tecnico/${techOrderId}/editar`]}>
        <Routes>
          <Route
            path="/servicio-tecnico/:techOrderId/editar"
            element={<TechnicalOrderEditarPage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('TechnicalOrderEditarPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useMutateTechnicalOrderMock.mockReturnValue(defaultMutations);
  });

  // T-14c-3a: renders form when order is draft
  it('renders TechnicalOrderForm in edit mode when order is draft', () => {
    useTechnicalOrderMock.mockReturnValue({
      data: makeOrder({ status: 'draft' }),
      isLoading: false,
      isError: false,
    });
    renderPage();
    expect(screen.getByTestId('technical-order-form')).toBeInTheDocument();
    expect(screen.getByTestId('technical-order-form')).toHaveAttribute('data-mode', 'edit');
  });

  // T-14c-3b: shows error guard when order is confirmed (not draft)
  it('shows error message for confirmed order (draft-only guard)', () => {
    useTechnicalOrderMock.mockReturnValue({
      data: makeOrder({ status: 'confirmed' }),
      isLoading: false,
      isError: false,
    });
    renderPage();
    expect(
      screen.getByText(/esta orden no puede editarse porque no está en estado borrador/i),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('technical-order-form')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /volver al detalle/i })).toBeInTheDocument();
  });

  // T-14c-3c: loading skeleton
  it('renders loading skeleton while order is loading', () => {
    useTechnicalOrderMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });
    renderPage();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  // T-14c-3d: successful submit navigates to detail page
  it('navigates to detail page after successful edit submit', async () => {
    const user = userEvent.setup();
    updateDraftMutateAsync.mockResolvedValue('2026-08-10T12:02:00Z');
    useTechnicalOrderMock.mockReturnValue({
      data: makeOrder({ status: 'draft' }),
      isLoading: false,
      isError: false,
    });
    renderPage();

    const submitBtn = screen.getByTestId('stub-submit');
    await user.click(submitBtn);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/servicio-tecnico/to-1');
    });
  });

  // T-14c-3e: "Volver al detalle" button on non-draft navigates to detail
  it('clicking "Volver al detalle" navigates to the detail page', async () => {
    const user = userEvent.setup();
    useTechnicalOrderMock.mockReturnValue({
      data: makeOrder({ status: 'in_progress' }),
      isLoading: false,
      isError: false,
    });
    renderPage();

    const backBtn = screen.getByRole('button', { name: /volver al detalle/i });
    await user.click(backBtn);

    expect(mockNavigate).toHaveBeenCalledWith('/servicio-tecnico/to-1');
  });
});
