import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import React from 'react';
import type { ReactNode } from 'react';

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

// Mock useNavigate so we can capture redirects
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

// Mock useOrden
const mockUseOrden = vi.fn();
vi.mock('@/hooks/useOrden', () => ({
  useOrden: (id: string) => mockUseOrden(id),
}));

// Mock useMutateOrden
const mockUpdateDraftOrden = vi.fn();
vi.mock('@/hooks/useMutateOrden', () => ({
  useMutateOrden: () => ({
    updateDraftOrden: {
      mutateAsync: mockUpdateDraftOrden,
      isPending: false,
    },
    createOrden: { mutateAsync: vi.fn(), isPending: false },
    confirmOrden: { mutateAsync: vi.fn(), isPending: false },
    cancelOrden: { mutateAsync: vi.fn(), isPending: false },
    setPickupPerson: { mutateAsync: vi.fn(), isPending: false },
  }),
}));

// Stub OrdenForm so route tests can focus on page-level behavior
const mockOrdenFormSubmit = vi.fn();
vi.mock('@/components/ordenes/OrdenForm', () => ({
  OrdenForm: ({
    mode,
    initialValues,
    onSubmit,
    onCancel,
  }: {
    mode: string;
    initialValues?: unknown;
    onSubmit: (values: unknown) => Promise<void>;
    onCancel?: () => void;
  }) => (
    <div data-testid="orden-form" data-mode={mode}>
      {initialValues ? (
        <span data-testid="initial-notes">
          {(initialValues as { notes?: string }).notes ?? ''}
        </span>
      ) : null}
      <button
        type="button"
        onClick={() => {
          mockOrdenFormSubmit(onSubmit);
          void onSubmit(initialValues ?? {});
        }}
      >
        Submit Form
      </button>
      <button type="button" onClick={() => onCancel?.()}>
        Cancel Form
      </button>
    </div>
  ),
}));

import OrdenEditarPage from '../OrdenEditarPage';

const draftOrden = {
  id: 'ord-draft-1',
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
  status: 'draft' as const,
  notes: 'Nota existente',
  created_at: '2026-08-11T10:00:00Z',
  updated_at: '2026-08-11T12:00:00Z',
  order_items: [
    {
      id: 'item-1',
      order_id: 'ord-draft-1',
      item_type: 'key' as const,
      quantity: 2,
      description: 'Pack A',
      status: 'pending' as const,
      building_id: 'bld-1',
      unit_id: null,
      unit_price: 150,
      product_id: 'prod-1',
      produced_key_id: null,
      pickup_particular_id: null,
      pickup_particulares: null,
      rfid_keys: null,
    },
  ],
};

const confirmedOrden = {
  ...draftOrden,
  id: 'ord-confirmed-1',
  status: 'confirmed' as const,
};

function makeWrapper(initialPath = '/ordenes/ord-draft-1/editar') {
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
            path: '/ordenes/:ordenId/editar',
            element: children,
          }),
          React.createElement(Route, {
            path: '/ordenes/:ordenId',
            element: React.createElement('div', null, 'Detail page'),
          }),
        ),
      ),
    );
  };
}

describe('OrdenEditarPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // T-17a: non-draft order redirects with toast
  it('redirects to detail page with warning toast when order is not draft', async () => {
    mockUseOrden.mockReturnValue({
      data: confirmedOrden,
      isLoading: false,
      isError: false,
    });

    const { toast } = await import('sonner');

    render(<OrdenEditarPage />, { wrapper: makeWrapper('/ordenes/ord-confirmed-1/editar') });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/ordenes/ord-confirmed-1', { replace: true });
    });
    expect(toast.warning).toHaveBeenCalledWith(
      'Solo se pueden editar órdenes en borrador.',
    );
  });

  // T-17b: draft order renders OrdenForm in edit mode with hydrated values
  it('renders OrdenForm in edit mode when order is draft', () => {
    mockUseOrden.mockReturnValue({
      data: draftOrden,
      isLoading: false,
      isError: false,
    });

    render(<OrdenEditarPage />, { wrapper: makeWrapper() });

    const form = screen.getByTestId('orden-form');
    expect(form).toBeInTheDocument();
    expect(form).toHaveAttribute('data-mode', 'edit');
  });

  // T-17c: draft order hydrates initialValues.notes from the orden data
  it('passes hydrated notes from orden as initialValues to OrdenForm', () => {
    mockUseOrden.mockReturnValue({
      data: draftOrden,
      isLoading: false,
      isError: false,
    });

    render(<OrdenEditarPage />, { wrapper: makeWrapper() });

    expect(screen.getByTestId('initial-notes')).toHaveTextContent('Nota existente');
  });

  // T-17d: submit calls updateDraftOrden.mutateAsync with correct shape
  it('calls updateDraftOrden.mutateAsync on form submit', async () => {
    const user = userEvent.setup();
    mockUseOrden.mockReturnValue({
      data: draftOrden,
      isLoading: false,
      isError: false,
    });
    mockUpdateDraftOrden.mockResolvedValueOnce('2026-08-11T13:00:00Z');

    render(<OrdenEditarPage />, { wrapper: makeWrapper() });

    const submitBtn = screen.getByRole('button', { name: /submit form/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(mockUpdateDraftOrden).toHaveBeenCalled();
    });

    // On success, navigate to detail page
    expect(mockNavigate).toHaveBeenCalledWith('/ordenes/ord-draft-1');
  });

  // T-17e: shows loading skeleton while order is fetching
  it('shows loading skeleton while order is loading', () => {
    mockUseOrden.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    render(<OrdenEditarPage />, { wrapper: makeWrapper() });

    expect(screen.queryByTestId('orden-form')).not.toBeInTheDocument();
    // Should render some loading indicator
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
