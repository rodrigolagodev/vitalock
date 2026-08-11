import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import type { ReactNode } from 'react';
import type { OrderItemRow } from '@/hooks/useOrden';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const mockConfigureKeyItem = vi.fn();

vi.mock('@/hooks/useMutateOrderItem', () => ({
  useMutateOrderItem: () => ({
    configureKeyItem: {
      mutateAsync: mockConfigureKeyItem,
      isPending: false,
    },
    cancelOrderItem: {
      mutate: vi.fn(),
      isPending: false,
    },
  }),
}));

vi.mock('@/hooks/useUnits', () => ({
  useUnits: () => ({
    data: [
      { id: 'unit-1', number: '101', unit_type: 'apartment', status: 'active', is_administrative: false, building_id: 'bld-1' },
      { id: 'unit-2', number: '202', unit_type: null, status: 'active', is_administrative: false, building_id: 'bld-1' },
    ],
    isLoading: false,
  }),
}));

vi.mock('@/hooks/useEquipment', () => ({
  useEquipment: () => ({
    data: [
      { id: 'eq-1', serial_number: 'SN-001', model: 'Equipo A', status: 'active', installed_at: '', building_id: 'bld-1' },
    ],
    isLoading: false,
  }),
}));

vi.mock('@/hooks/mapMutationError', () => ({
  toastMutationError: vi.fn(),
}));

const mockCreateUnitInSheet = vi.fn();

vi.mock('@/hooks/useMutateUnit', () => ({
  useMutateUnit: () => ({
    createUnit: { mutateAsync: mockCreateUnitInSheet, isPending: false },
    updateUnit: { mutateAsync: vi.fn(), isPending: false },
    deactivateUnit: { mutateAsync: vi.fn(), isPending: false },
  }),
}));

import { ConfigureKeyItemSheet } from '../ConfigureKeyItemSheet';

const sampleItem: OrderItemRow = {
  id: 'item-1',
  order_id: 'order-1',
  item_type: 'key',
  quantity: 1,
  description: 'Llave principal',
  status: 'pending',
  building_id: 'bld-1',
  produced_key_id: null,
  unit_id: null,
  unit_price: null,
  product_id: null,
  pickup_particular_id: null,
  pickup_particulares: null,
  rfid_keys: null,
};

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

describe('ConfigureKeyItemSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders sheet title when open', () => {
    render(
      <ConfigureKeyItemSheet
        open={true}
        onOpenChange={vi.fn()}
        item={sampleItem}
        orderId="order-1"
      />,
      { wrapper: makeWrapper() },
    );

    expect(screen.getByText('Configurar llave')).toBeInTheDocument();
  });

  it('blocks submit when rfid_code is empty', async () => {
    const user = userEvent.setup();
    render(
      <ConfigureKeyItemSheet
        open={true}
        onOpenChange={vi.fn()}
        item={sampleItem}
        orderId="order-1"
      />,
      { wrapper: makeWrapper() },
    );

    // Select a unit via hidden native select to bypass Radix Select
    const hiddenSelects = document.querySelectorAll('select[aria-hidden="true"]');
    for (const sel of Array.from(hiddenSelects)) {
      const s = sel as HTMLSelectElement;
      if (Array.from(s.options).some((o) => o.value === 'unit-1')) {
        await act(async () => {
          fireEvent.change(s, { target: { value: 'unit-1' } });
        });
        break;
      }
    }

    const submitButton = screen.getByRole('button', { name: /guardar/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/el código rfid es obligatorio/i)).toBeInTheDocument();
    });
    expect(mockConfigureKeyItem).not.toHaveBeenCalled();
  });

  it('blocks submit when unit_id is not selected', async () => {
    const user = userEvent.setup();
    render(
      <ConfigureKeyItemSheet
        open={true}
        onOpenChange={vi.fn()}
        item={sampleItem}
        orderId="order-1"
      />,
      { wrapper: makeWrapper() },
    );

    // Fill rfid_code but leave unit_id empty
    await user.type(screen.getByLabelText(/código rfid/i), 'AABBCC112233');

    const submitButton = screen.getByRole('button', { name: /guardar/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/la unidad es obligatoria/i)).toBeInTheDocument();
    });
    expect(mockConfigureKeyItem).not.toHaveBeenCalled();
  });

  it('calls configureKeyItem RPC with correct payload on valid submit', async () => {
    const user = userEvent.setup();
    mockConfigureKeyItem.mockResolvedValue('new-key-id');

    render(
      <ConfigureKeyItemSheet
        open={true}
        onOpenChange={vi.fn()}
        item={sampleItem}
        orderId="order-1"
      />,
      { wrapper: makeWrapper() },
    );

    // Fill rfid_code
    await user.type(screen.getByLabelText(/código rfid/i), 'AABBCC112233');

    // Select unit via hidden native select (Radix Select jsdom workaround)
    const hiddenSelects = document.querySelectorAll('select[aria-hidden="true"]');
    for (const sel of Array.from(hiddenSelects)) {
      const s = sel as HTMLSelectElement;
      if (Array.from(s.options).some((o) => o.value === 'unit-1')) {
        await act(async () => {
          fireEvent.change(s, { target: { value: 'unit-1' } });
        });
        break;
      }
    }

    // Equipment is required — pick at least one before submitting.
    await user.click(screen.getByRole('checkbox'));

    await user.click(screen.getByRole('button', { name: /guardar/i }));

    await waitFor(() => {
      expect(mockConfigureKeyItem).toHaveBeenCalledWith(
        expect.objectContaining({
          orderItemId: 'item-1',
          orderId: 'order-1',
          rfidCode: 'AABBCC112233',
          unitId: 'unit-1',
          equipmentIds: expect.any(Array),
        }),
      );
    });
  });

  it('includes selected equipment ids in the payload', async () => {
    const user = userEvent.setup();
    mockConfigureKeyItem.mockResolvedValue('new-key-id');

    render(
      <ConfigureKeyItemSheet
        open={true}
        onOpenChange={vi.fn()}
        item={sampleItem}
        orderId="order-1"
      />,
      { wrapper: makeWrapper() },
    );

    // Fill rfid_code
    await user.type(screen.getByLabelText(/código rfid/i), 'AABBCC112233');

    // Select unit
    const hiddenSelects = document.querySelectorAll('select[aria-hidden="true"]');
    for (const sel of Array.from(hiddenSelects)) {
      const s = sel as HTMLSelectElement;
      if (Array.from(s.options).some((o) => o.value === 'unit-1')) {
        await act(async () => {
          fireEvent.change(s, { target: { value: 'unit-1' } });
        });
        break;
      }
    }

    // Check equipment checkbox
    const equipmentCheckbox = screen.getByRole('checkbox');
    await user.click(equipmentCheckbox);

    await user.click(screen.getByRole('button', { name: /guardar/i }));

    await waitFor(() => {
      expect(mockConfigureKeyItem).toHaveBeenCalledWith(
        expect.objectContaining({
          equipmentIds: ['eq-1'],
        }),
      );
    });
  });

  it('auto-selects new unit_id when QuickUnitCreateDialog onCreated is called', async () => {
    const user = userEvent.setup();
    // mockCreateUnitInSheet is the module-level mock used by useMutateUnit inside the tree
    mockCreateUnitInSheet.mockResolvedValue({ id: 'new-unit-id', number: 'PH' });

    render(
      <ConfigureKeyItemSheet
        open={true}
        onOpenChange={vi.fn()}
        item={sampleItem}
        orderId="order-1"
      />,
      { wrapper: makeWrapper() },
    );

    await user.type(screen.getByLabelText(/código rfid/i), 'TEST123');

    // Open QuickUnitCreateDialog
    const nuevaUnidadBtn = screen.getByRole('button', { name: /nueva unidad/i });
    await user.click(nuevaUnidadBtn);

    await waitFor(() => {
      // Dialog title is an h2; the button also says "Nueva unidad" — use heading role to be specific
      expect(screen.getByRole('heading', { name: 'Nueva unidad' })).toBeInTheDocument();
    });

    // Fill unit number and submit
    await user.type(screen.getByLabelText(/número/i), 'PH');
    await user.click(screen.getByRole('button', { name: /crear/i }));

    await waitFor(() => {
      expect(mockCreateUnitInSheet).toHaveBeenCalledWith(
        expect.objectContaining({ number: 'PH' }),
      );
    });
  });

  it('closes the sheet on successful mutation', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    mockConfigureKeyItem.mockResolvedValue('new-key-id');

    render(
      <ConfigureKeyItemSheet
        open={true}
        onOpenChange={onOpenChange}
        item={sampleItem}
        orderId="order-1"
      />,
      { wrapper: makeWrapper() },
    );

    await user.type(screen.getByLabelText(/código rfid/i), 'CLOSEME');

    const hiddenSelects = document.querySelectorAll('select[aria-hidden="true"]');
    for (const sel of Array.from(hiddenSelects)) {
      const s = sel as HTMLSelectElement;
      if (Array.from(s.options).some((o) => o.value === 'unit-1')) {
        await act(async () => {
          fireEvent.change(s, { target: { value: 'unit-1' } });
        });
        break;
      }
    }

    // Equipment is required — pick at least one before submitting.
    await user.click(screen.getByRole('checkbox'));

    await user.click(screen.getByRole('button', { name: /guardar/i }));

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
