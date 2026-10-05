import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

let mockPending = false;

vi.mock('@/hooks/useMutateStockMovement', () => ({
  useMutateStockMovement: () => ({
    createMovement: { mutateAsync: vi.fn(), isPending: mockPending },
    createProductWithStock: { mutateAsync: vi.fn(), isPending: false },
  }),
}));

vi.mock('@/hooks/useProducts', () => ({
  useProducts: () => ({ data: [{ id: 'p-1', name: 'Llave RFID', category: 'rfid_key' }] }),
}));

vi.mock('@vitalock/shared', async () => {
  const actual = await vi.importActual<typeof import('@vitalock/shared')>('@vitalock/shared');
  return { ...actual, useAuthContext: () => ({ staff: { id: 'staff-1', full_name: 'Ana' } }) };
});

import { CargarProductoSheet } from '../CargarProductoSheet';
import { expectInvalidFieldWired } from '@/test/expectFieldErrorWiring';

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe('CargarProductoSheet submit button', () => {
  beforeEach(() => {
    mockPending = false;
  });

  it('shows the plain "Cargar" label with no spinner when idle', () => {
    render(<CargarProductoSheet open onOpenChange={vi.fn()} />, { wrapper: makeWrapper() });

    const button = screen.getByRole('button', { name: 'Cargar' });
    expect(button).toBeEnabled();
    expect(within(button).queryByRole('status')).not.toBeInTheDocument();
  });

  it('keeps the label, disables the button and shows a status spinner while pending', () => {
    mockPending = true;
    render(<CargarProductoSheet open onOpenChange={vi.fn()} />, { wrapper: makeWrapper() });

    expect(screen.queryByText('Cargando...')).not.toBeInTheDocument();
    const spinner = screen.getByRole('status', { name: 'Cargando producto' });
    const button = spinner.closest('button') as HTMLElement;
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('Cargar');
    expect(spinner.querySelector('.animate-spin')).not.toBeNull();
  });

  it('wires the field error to its control on an invalid submit (FormField)', async () => {
    const user = userEvent.setup();
    render(<CargarProductoSheet open onOpenChange={vi.fn()} />, { wrapper: makeWrapper() });
    await user.click(screen.getByRole('button', { name: 'Cargar' }));
    await waitFor(() => expectInvalidFieldWired());
  });
});
