import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import type { ReactNode } from 'react';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const mockRecordPickup = vi.fn();

vi.mock('@/hooks/useMutateKey', () => ({
  useMutateKey: () => ({
    createKey: { mutateAsync: vi.fn(), isPending: false },
    changeStatus: { mutateAsync: vi.fn(), isPending: false },
    recordPickup: { mutateAsync: mockRecordPickup, isPending: false },
  }),
}));

vi.mock('@/hooks/mapMutationError', () => ({
  toastMutationError: vi.fn(),
}));

import { PickupKeyDialog } from '../PickupKeyDialog';
import type { OrderItemRow } from '@/hooks/useOrden';

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(
      MemoryRouter,
      null,
      React.createElement(QueryClientProvider, { client: queryClient }, children),
    );
  };
}

const configuredKeyItem: OrderItemRow = {
  id: 'item-1',
  order_id: 'o-1',
  item_type: 'key',
  quantity: 1,
  description: 'Llave principal',
  status: 'configured',
  building_id: 'b-1',
  produced_key_id: 'k-1',
  unit_id: null,
  unit_price: null,
  product_id: null,
  pickup_particular_id: null,
  pickup_particulares: null,
  rfid_keys: {
    picked_up_at: null,
    picked_up_by_name: null,
    picked_up_by_surname: null,
    picked_up_by_dni: null,
    delivered_by_staff_id: null,
  },
};

describe('PickupKeyDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prefills from the pickup person and submits recordPickup', async () => {
    const user = userEvent.setup();

    render(
      <PickupKeyDialog
        open
        onOpenChange={vi.fn()}
        item={configuredKeyItem}
        orderId="o-1"
        pickupPerson={{ full_name: 'Juan García', dni: '30111222' }}
      />,
      { wrapper: makeWrapper() },
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/nombre/i)).toHaveValue('Juan');
      expect(screen.getByLabelText(/apellido/i)).toHaveValue('García');
      expect(screen.getByLabelText(/dni/i)).toHaveValue('30111222');
    });

    await user.click(screen.getByRole('button', { name: /registrar retiro/i }));

    await waitFor(() => {
      expect(mockRecordPickup).toHaveBeenCalledWith({
        order_id: 'o-1',
        key_id: 'k-1',
        picked_up_by_name: 'Juan',
        picked_up_by_surname: 'García',
        picked_up_by_dni: '30111222',
      });
    });
  });

  it('blocks submit when name and dni are missing', async () => {
    const user = userEvent.setup();

    render(
      <PickupKeyDialog
        open
        onOpenChange={vi.fn()}
        item={configuredKeyItem}
        orderId="o-1"
      />,
      { wrapper: makeWrapper() },
    );

    await user.click(screen.getByRole('button', { name: /registrar retiro/i }));

    await waitFor(() => {
      expect(screen.getByText('El nombre es obligatorio')).toBeInTheDocument();
      expect(screen.getByText('El DNI es obligatorio')).toBeInTheDocument();
    });
    expect(mockRecordPickup).not.toHaveBeenCalled();
  });

  it('disables submit when the item has no produced key', () => {
    render(
      <PickupKeyDialog
        open
        onOpenChange={vi.fn()}
        item={{ ...configuredKeyItem, produced_key_id: null }}
        orderId="o-1"
      />,
      { wrapper: makeWrapper() },
    );

    expect(
      screen.getByRole('button', { name: /registrar retiro/i }),
    ).toBeDisabled();
  });

  it('closes the dialog after a successful pickup registration', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    mockRecordPickup.mockResolvedValue(undefined);

    render(
      <PickupKeyDialog
        open
        onOpenChange={onOpenChange}
        item={configuredKeyItem}
        orderId="o-1"
        pickupPerson={{ full_name: 'Juan García', dni: '30111222' }}
      />,
      { wrapper: makeWrapper() },
    );

    await user.click(screen.getByRole('button', { name: /registrar retiro/i }));

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
