import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const mockCreateMovement = vi.fn();

vi.mock('@/hooks/useMutateStockMovement', () => ({
  useMutateStockMovement: () => ({
    createMovement: {
      mutateAsync: mockCreateMovement,
      isPending: false,
    },
    createProductWithStock: {
      mutateAsync: vi.fn(),
      isPending: false,
    },
  }),
}));

vi.mock('@vitalock/shared', async () => {
  const actual = await vi.importActual<typeof import('@vitalock/shared')>('@vitalock/shared');
  return {
    ...actual,
    useAuthContext: () => ({ staff: { id: 'staff-1', full_name: 'Ana' } }),
  };
});

import { AjusteStockSheet } from '../AjusteStockSheet';

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  productId: 'prod-1',
  productName: 'Llave RFID genérica',
  stockDisponible: 10,
};

describe('AjusteStockSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with product name and current stock in the header', () => {
    render(<AjusteStockSheet {...baseProps} />, { wrapper: makeWrapper() });

    expect(screen.getByText(/Nuevo movimiento — Llave RFID genérica/)).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
  });

  it('exposes the 5 manual movement types', async () => {
    const user = userEvent.setup();
    render(<AjusteStockSheet {...baseProps} />, { wrapper: makeWrapper() });

    await user.click(screen.getByRole('combobox'));

    expect(await screen.findByRole('option', { name: 'Compra' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Devolución' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Ajuste manual' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Baja por defectuoso' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Baja por pérdida' })).toBeInTheDocument();
  });

  it('submits an ajuste_manual movement with the entered quantity', async () => {
    mockCreateMovement.mockResolvedValueOnce('mov-1');
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    render(
      <AjusteStockSheet {...baseProps} onOpenChange={onOpenChange} />,
      { wrapper: makeWrapper() },
    );

    await user.clear(screen.getByLabelText(/Cantidad/));
    await user.type(screen.getByLabelText(/Cantidad/), '3');
    await user.type(screen.getByLabelText(/Nota/), 'Recuento físico');
    await user.click(screen.getByRole('button', { name: /Registrar movimiento/ }));

    await waitFor(() => expect(mockCreateMovement).toHaveBeenCalledTimes(1));
    expect(mockCreateMovement).toHaveBeenCalledWith({
      productId: 'prod-1',
      movementType: 'ajuste_manual',
      quantity: 3,
      unitCost: null,
      note: 'Recuento físico',
      actor_staff_id: 'staff-1',
    });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('rejects submit when quantity is 0', async () => {
    const user = userEvent.setup();
    render(<AjusteStockSheet {...baseProps} />, { wrapper: makeWrapper() });

    await user.click(screen.getByRole('button', { name: /Registrar movimiento/ }));

    expect(await screen.findByText('La cantidad no puede ser 0')).toBeInTheDocument();
    expect(mockCreateMovement).not.toHaveBeenCalled();
  });

  it('requires negative quantity for baja_defectuoso', async () => {
    const user = userEvent.setup();
    render(<AjusteStockSheet {...baseProps} />, { wrapper: makeWrapper() });

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Baja por defectuoso' }));

    await user.clear(screen.getByLabelText(/Cantidad/));
    await user.type(screen.getByLabelText(/Cantidad/), '2');
    await user.click(screen.getByRole('button', { name: /Registrar movimiento/ }));

    expect(await screen.findByText(/Las bajas requieren cantidad negativa/)).toBeInTheDocument();
    expect(mockCreateMovement).not.toHaveBeenCalled();
  });

  it('blocks submit when the resulting stock would go negative', async () => {
    const user = userEvent.setup();
    render(
      <AjusteStockSheet {...baseProps} stockDisponible={2} />,
      { wrapper: makeWrapper() },
    );

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Baja por pérdida' }));

    // type="number" inputs are quirky with user.type for negatives — set the
    // value directly so the controller sees -5.
    fireEvent.change(screen.getByLabelText(/Cantidad/), { target: { value: '-5' } });

    expect(
      await screen.findByText(/el movimiento dejaría el stock en negativo/),
    ).toBeInTheDocument();

    const submit = screen.getByRole('button', { name: /Registrar movimiento/ });
    expect(submit).toBeDisabled();
  });
});
