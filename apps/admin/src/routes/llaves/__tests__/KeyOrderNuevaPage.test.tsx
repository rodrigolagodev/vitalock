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

// Stub the form — tests in this file focus on page-level behaviour (nav, wiring)
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
        Crear y confirmar orden
      </button>
    </div>
  ),
}));

const { createKeyOrderMock } = vi.hoisted(() => ({
  createKeyOrderMock: vi.fn(),
}));

vi.mock('@/hooks/useMutateKeyOrder', () => ({
  useMutateKeyOrder: () => ({
    createKeyOrder: {
      mutateAsync: createKeyOrderMock,
      isPending: false,
    },
    confirmKeyOrder: { mutate: vi.fn(), isPending: false },
    cancelKeyOrder: { mutate: vi.fn(), isPending: false },
    updateDraftKeyOrder: { mutate: vi.fn(), isPending: false },
    markKeyOrderInvoiced: { mutate: vi.fn(), isPending: false },
    setKeyOrderPickupPerson: { mutate: vi.fn(), isPending: false },
    configureKeyOrderItem: { mutate: vi.fn(), isPending: false },
  }),
}));

import KeyOrderNuevaPage from '../KeyOrderNuevaPage';

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/llaves/nueva']}>
        <Routes>
          <Route path="/llaves/nueva" element={<KeyOrderNuevaPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('KeyOrderNuevaPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // T-13c-2a: page renders the form in create mode
  it('renders KeyOrderForm in create mode', () => {
    renderPage();
    expect(screen.getByTestId('key-order-form')).toBeInTheDocument();
    expect(screen.getByTestId('key-order-form')).toHaveAttribute('data-mode', 'create');
  });

  // T-13c-2b: page shows breadcrumb and heading
  it('shows page heading "Nueva orden de llaves"', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: /nueva orden de llaves/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /llaves/i })).toBeInTheDocument();
  });

  // T-13c-2c: successful submit navigates to detail page
  it('navigates to detail page after successful submit', async () => {
    const user = userEvent.setup();
    createKeyOrderMock.mockResolvedValue('ko-new-1');
    renderPage();

    const submitBtn = screen.getByTestId('stub-submit');
    await user.click(submitBtn);

    await waitFor(() => {
      expect(createKeyOrderMock).toHaveBeenCalledOnce();
      expect(mockNavigate).toHaveBeenCalledWith('/llaves/ko-new-1');
    });
  });
});
