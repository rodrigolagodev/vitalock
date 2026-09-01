import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import React from 'react';

// Hoist mock refs
const { mockNavigate } = vi.hoisted(() => ({
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

// Stub the form — tests focus on page-level behaviour
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
                item_type: 'maintain_equipment',
                quantity: 1,
                description: '',
                building_id: 'bld-1',
                unit_price: null,
                product_id: null,
                intended_equipment_id: 'equip-1',
                intended_assignee_staff_id: 'staff-1',
              },
            ],
          })
        }
      >
        Crear y confirmar orden
      </button>
    </div>
  ),
}));

const { createTechnicalOrderMock } = vi.hoisted(() => ({
  createTechnicalOrderMock: vi.fn(),
}));

vi.mock('@/hooks/useMutateTechnicalOrder', () => ({
  useMutateTechnicalOrder: () => ({
    createTechnicalOrder: {
      mutateAsync: createTechnicalOrderMock,
      isPending: false,
    },
    confirmTechnicalOrder: { mutate: vi.fn(), isPending: false },
    cancelTechnicalOrder: { mutate: vi.fn(), isPending: false },
    updateDraftTechnicalOrder: { mutate: vi.fn(), isPending: false },
    markTechnicalOrderInvoiced: { mutate: vi.fn(), isPending: false },
    recomputeTechnicalOrderStatus: { mutate: vi.fn(), isPending: false },
  }),
}));

import TechnicalOrderNuevaPage from '../TechnicalOrderNuevaPage';

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/servicio-tecnico/nueva']}>
        <Routes>
          <Route path="/servicio-tecnico/nueva" element={<TechnicalOrderNuevaPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('TechnicalOrderNuevaPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // T-14c-2a: page renders the form in create mode
  it('renders TechnicalOrderForm in create mode', () => {
    renderPage();
    expect(screen.getByTestId('technical-order-form')).toBeInTheDocument();
    expect(screen.getByTestId('technical-order-form')).toHaveAttribute('data-mode', 'create');
  });

  // T-14c-2b: page shows breadcrumb and heading
  it('shows page heading "Nueva orden de servicio técnico"', () => {
    renderPage();
    expect(
      screen.getByRole('heading', { name: /nueva orden de servicio técnico/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /servicio técnico/i })).toBeInTheDocument();
  });

  // T-14c-2c: successful submit navigates to detail page
  it('navigates to detail page after successful submit', async () => {
    const user = userEvent.setup();
    createTechnicalOrderMock.mockResolvedValue('to-new-1');
    renderPage();

    const submitBtn = screen.getByTestId('stub-submit');
    await user.click(submitBtn);

    await waitFor(() => {
      expect(createTechnicalOrderMock).toHaveBeenCalledOnce();
      expect(mockNavigate).toHaveBeenCalledWith('/servicio-tecnico/to-new-1');
    });
  });
});
