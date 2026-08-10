import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import type { ReactNode } from 'react';
import type { OrderItemRow } from '@/hooks/useOrden';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const mockCancelOrderItem = vi.fn();

vi.mock('@/hooks/useMutateOrderItem', () => ({
  useMutateOrderItem: () => ({
    configureKeyItem: { mutateAsync: vi.fn(), isPending: false },
    cancelOrderItem: {
      mutate: mockCancelOrderItem,
      isPending: false,
    },
  }),
}));

vi.mock('@/hooks/useUnits', () => ({
  useUnits: () => ({
    data: [],
    isLoading: false,
  }),
}));

vi.mock('@/hooks/useEquipment', () => ({
  useEquipment: () => ({
    data: [],
    isLoading: false,
  }),
}));

vi.mock('@/hooks/useMutateUnit', () => ({
  useMutateUnit: () => ({
    createUnit: { mutateAsync: vi.fn(), isPending: false },
    updateUnit: { mutateAsync: vi.fn(), isPending: false },
    deactivateUnit: { mutateAsync: vi.fn(), isPending: false },
  }),
}));

vi.mock('@/hooks/mapMutationError', () => ({
  toastMutationError: vi.fn(),
}));

const mockRecordPickup = vi.fn();

vi.mock('@/hooks/useMutateKey', () => ({
  useMutateKey: () => ({
    createKey: { mutateAsync: vi.fn(), isPending: false },
    changeStatus: { mutateAsync: vi.fn(), isPending: false },
    recordPickup: { mutateAsync: mockRecordPickup, isPending: false },
  }),
}));

import { OrderItemsTable } from '../OrderItemsTable';

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

const pendingKeyItem: OrderItemRow = {
  id: 'item-1',
  order_id: 'order-1',
  item_type: 'key',
  quantity: 1,
  description: 'Llave principal',
  status: 'pending',
  building_id: 'bld-1',
  produced_key_id: null,
  rfid_keys: null,
};

const configuredKeyItem: OrderItemRow = {
  id: 'item-2',
  order_id: 'order-1',
  item_type: 'key',
  quantity: 1,
  description: 'Llave secundaria',
  status: 'configured',
  building_id: 'bld-1',
  produced_key_id: 'key-id-1',
  rfid_keys: null,
};

const cancelledItem: OrderItemRow = {
  id: 'item-3',
  order_id: 'order-1',
  item_type: 'equipment',
  quantity: 2,
  description: 'Equipo extra',
  status: 'cancelled',
  building_id: null,
  produced_key_id: null,
  rfid_keys: null,
};

const pendingNonKeyItem: OrderItemRow = {
  id: 'item-4',
  order_id: 'order-1',
  item_type: 'maintenance',
  quantity: 1,
  description: 'Servicio de mantenimiento',
  status: 'pending',
  building_id: null,
  produced_key_id: null,
  rfid_keys: null,
};

const pickedUpKeyItem: OrderItemRow = {
  id: 'item-5',
  order_id: 'order-1',
  item_type: 'key',
  quantity: 1,
  description: 'Llave ya retirada',
  status: 'configured',
  building_id: 'bld-1',
  produced_key_id: 'key-id-2',
  rfid_keys: {
    picked_up_at: '2026-08-10T00:00:00Z',
    picked_up_by_name: 'Juan',
    picked_up_by_surname: 'García',
    picked_up_by_dni: '30111222',
    delivered_by_staff_id: null,
  },
};

describe('OrderItemsTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders "Configurar" button only for pending key items', () => {
    render(
      <OrderItemsTable
        items={[pendingKeyItem, configuredKeyItem, cancelledItem]}
        orderId="order-1"
      />,
      { wrapper: makeWrapper() },
    );

    // Only one Configurar button (for the pending key item)
    const configurarButtons = screen.getAllByRole('button', { name: /configurar/i });
    expect(configurarButtons).toHaveLength(1);
  });

  it('does not render "Configurar" button for configured key items', () => {
    render(
      <OrderItemsTable
        items={[configuredKeyItem]}
        orderId="order-1"
      />,
      { wrapper: makeWrapper() },
    );

    expect(screen.queryByRole('button', { name: /configurar/i })).not.toBeInTheDocument();
  });

  it('does not render "Configurar" button for cancelled items', () => {
    render(
      <OrderItemsTable
        items={[cancelledItem]}
        orderId="order-1"
      />,
      { wrapper: makeWrapper() },
    );

    expect(screen.queryByRole('button', { name: /configurar/i })).not.toBeInTheDocument();
  });

  it('renders "Cancelar ítem" button for pending items regardless of type', () => {
    render(
      <OrderItemsTable
        items={[pendingKeyItem, pendingNonKeyItem]}
        orderId="order-1"
      />,
      { wrapper: makeWrapper() },
    );

    const cancelButtons = screen.getAllByRole('button', { name: /cancelar ítem/i });
    expect(cancelButtons).toHaveLength(2);
  });

  it('does not render action buttons for configured items', () => {
    render(
      <OrderItemsTable
        items={[configuredKeyItem]}
        orderId="order-1"
      />,
      { wrapper: makeWrapper() },
    );

    expect(screen.queryByRole('button', { name: /configurar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cancelar ítem/i })).not.toBeInTheDocument();
  });

  it('does not render action buttons for cancelled items', () => {
    render(
      <OrderItemsTable
        items={[cancelledItem]}
        orderId="order-1"
      />,
      { wrapper: makeWrapper() },
    );

    expect(screen.queryByRole('button', { name: /configurar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cancelar ítem/i })).not.toBeInTheDocument();
  });

  it('calls cancelOrderItem when "Cancelar ítem" is clicked on a pending item', async () => {
    const user = userEvent.setup();
    render(
      <OrderItemsTable
        items={[pendingNonKeyItem]}
        orderId="order-1"
      />,
      { wrapper: makeWrapper() },
    );

    const cancelButton = screen.getByRole('button', { name: /cancelar ítem/i });
    await user.click(cancelButton);

    expect(mockCancelOrderItem).toHaveBeenCalledWith({
      id: 'item-4',
      orderId: 'order-1',
    });
  });

  it('renders status badge for each item', () => {
    render(
      <OrderItemsTable
        items={[pendingKeyItem, configuredKeyItem, cancelledItem]}
        orderId="order-1"
      />,
      { wrapper: makeWrapper() },
    );

    expect(screen.getByText('Pendiente')).toBeInTheDocument();
    expect(screen.getByText('Configurado')).toBeInTheDocument();
    expect(screen.getByText('Cancelado')).toBeInTheDocument();
  });

  it('shows empty state when items array is empty', () => {
    render(
      <OrderItemsTable items={[]} orderId="order-1" />,
      { wrapper: makeWrapper() },
    );

    expect(screen.getByText(/sin ítems/i)).toBeInTheDocument();
  });

  it('renders item type labels in Spanish', () => {
    render(
      <OrderItemsTable
        items={[pendingKeyItem, pendingNonKeyItem]}
        orderId="order-1"
      />,
      { wrapper: makeWrapper() },
    );

    expect(screen.getByText('Llave')).toBeInTheDocument();
    expect(screen.getByText('Mantenimiento')).toBeInTheDocument();
  });

  it('renders "Registrar retiro" for configured keys without pickup when canRegisterPickup', () => {
    render(
      <OrderItemsTable
        items={[configuredKeyItem]}
        orderId="order-1"
        canRegisterPickup
      />,
      { wrapper: makeWrapper() },
    );

    expect(
      screen.getByRole('button', { name: /registrar retiro/i }),
    ).toBeInTheDocument();
  });

  it('hides "Registrar retiro" when canRegisterPickup is false', () => {
    render(
      <OrderItemsTable items={[configuredKeyItem]} orderId="order-1" />,
      { wrapper: makeWrapper() },
    );

    expect(
      screen.queryByRole('button', { name: /registrar retiro/i }),
    ).not.toBeInTheDocument();
  });

  it('hides "Registrar retiro" for keys already picked up', () => {
    render(
      <OrderItemsTable
        items={[pickedUpKeyItem]}
        orderId="order-1"
        canRegisterPickup
      />,
      { wrapper: makeWrapper() },
    );

    expect(
      screen.queryByRole('button', { name: /registrar retiro/i }),
    ).not.toBeInTheDocument();
  });

  it('hides "Registrar retiro" for non-key configured items', () => {
    render(
      <OrderItemsTable
        items={[{ ...pendingNonKeyItem, status: 'configured' }]}
        orderId="order-1"
        canRegisterPickup
      />,
      { wrapper: makeWrapper() },
    );

    expect(
      screen.queryByRole('button', { name: /registrar retiro/i }),
    ).not.toBeInTheDocument();
  });

  it('opens PickupKeyDialog prefilled when "Registrar retiro" is clicked', async () => {
    const user = userEvent.setup();
    render(
      <OrderItemsTable
        items={[configuredKeyItem]}
        orderId="order-1"
        canRegisterPickup
        pickupPerson={{ full_name: 'García Juan', dni: '30111222' }}
      />,
      { wrapper: makeWrapper() },
    );

    await user.click(screen.getByRole('button', { name: /registrar retiro/i }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText(/nombre/i)).toHaveValue('García');
    expect(screen.getByLabelText(/dni/i)).toHaveValue('30111222');
  });
});
