import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import type { ReactNode } from 'react';
import type { KeyOrderDetailRow } from '@/hooks/useKeyOrder';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));

vi.mock('@/hooks/useAdministrations', () => ({
  useAdministrations: () => ({ data: [{ id: 'adm-1', company_name: 'Admin García S.A.' }] }),
}));

vi.mock('@/hooks/useBuildings', () => ({
  useBuildings: () => ({ data: [{ id: 'bld-1', name: 'Edificio Central', address: 'Av 1 100' }] }),
}));

vi.mock('@/hooks/useProducts', () => ({
  useProducts: () => ({ data: [{ id: 'prod-1', name: 'Llave RFID Std', stock_disponible: 10 }] }),
}));

vi.mock('@/hooks/useUnits', () => ({
  useUnits: () => ({ data: [{ id: 'unit-1', number: '1A', unit_type: 'apartment' }] }),
}));

vi.mock('@/components/particulares/ParticularSelector', () => ({
  ParticularSelector: ({
    onChange,
    disabled,
  }: {
    onChange: (p: unknown) => void;
    disabled?: boolean;
  }) => (
    <button
      type="button"
      data-testid="particular-selector"
      disabled={disabled}
      onClick={() =>
        onChange({
          id: 'part-1',
          full_name: 'López María',
          dni: '25333444',
          phone: null,
          email: null,
          unit_id: 'u-1',
          unit_building_id: 'bld-1',
        })
      }
    >
      Seleccionar particular
    </button>
  ),
}));

vi.mock('@/components/particulares/ParticularFormSheet', () => ({
  ParticularFormSheet: () => null,
}));

vi.mock('@/components/llaves/QuickUnitCreateDialog', () => ({
  QuickUnitCreateDialog: ({
    open,
    buildingId,
    onOpenChange,
    onCreated,
  }: {
    open: boolean;
    buildingId: string;
    onOpenChange: (open: boolean) => void;
    onCreated: (unitId: string) => void;
  }) =>
    open ? (
      <div data-testid="quick-unit-create" data-building={buildingId}>
        <button type="button" onClick={() => onCreated('unit-new-1')}>
          Confirmar creación
        </button>
        <button type="button" onClick={() => onOpenChange(false)}>
          Cerrar
        </button>
      </div>
    ) : null,
}));

vi.mock('@/components/buildings/BuildingCombobox', () => ({
  BuildingCombobox: ({
    onChange,
    value,
  }: {
    onChange: (v: string | null) => void;
    value?: string | null;
  }) => (
    <button
      type="button"
      data-testid="building-combobox"
      onClick={() => onChange('bld-1')}
    >
      {value ?? 'Seleccionar edificio'}
    </button>
  ),
}));

// Import after mocks
import { KeyOrderForm } from '../KeyOrderForm';
import type { KeyOrderFormValues } from '../KeyOrderForm';

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

function makeInitialOrder(overrides: Partial<KeyOrderDetailRow> = {}): KeyOrderDetailRow {
  return {
    id: 'ko-1',
    order_number: 'ORD-LLV-000001',
    client_type: 'administration',
    administration_id: 'adm-1',
    administrations: { company_name: 'Admin García S.A.' },
    particular_id: null,
    pickup_particular_id: null,
    particulares: null,
    particular_full_name: null,
    particular_dni: null,
    particular_phone: null,
    particular_email: null,
    status: 'draft',
    notes: 'Nota de prueba',
    created_at: '2026-08-10T12:00:00Z',
    updated_at: '2026-08-10T12:01:00Z',
    key_order_items: [
      {
        id: 'item-1',
        order_id: 'ko-1',
        item_type: 'key',
        quantity: 2,
        description: null,
        status: 'pending',
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
    ...overrides,
  };
}

describe('KeyOrderForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // T-13c-1a: create mode renders correct submit label
  it('renders in create mode with "Crear y confirmar orden" submit button', () => {
    const onSubmit = vi.fn();
    render(<KeyOrderForm mode="create" onSubmit={onSubmit} />, {
      wrapper: makeWrapper(),
    });
    expect(
      screen.getByRole('button', { name: /crear y confirmar orden/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('Cliente')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /ítems/i })).toBeInTheDocument();
  });

  // T-13c-1b: edit mode renders correct submit label and pre-populates notes
  it('renders in edit mode with "Guardar cambios" button and pre-populated notes', () => {
    const onSubmit = vi.fn();
    const initialOrder = makeInitialOrder();
    render(
      <KeyOrderForm mode="edit" initialOrder={initialOrder} onSubmit={onSubmit} />,
      { wrapper: makeWrapper() },
    );
    expect(
      screen.getByRole('button', { name: /guardar cambios/i }),
    ).toBeInTheDocument();
    const notesTextarea = screen.getByPlaceholderText(/observaciones adicionales/i);
    expect(notesTextarea).toHaveValue('Nota de prueba');
  });

  // T-13c-1c: edit mode shows pre-populated item card
  it('renders pre-populated item card in edit mode', () => {
    const onSubmit = vi.fn();
    render(
      <KeyOrderForm mode="edit" initialOrder={makeInitialOrder()} onSubmit={onSubmit} />,
      { wrapper: makeWrapper() },
    );
    expect(screen.getByText('Ítem 1')).toBeInTheDocument();
    expect(screen.getByTestId('key-order-item-0')).toBeInTheDocument();
  });

  // T-13c-1d: validation blocks submit when no items
  it('blocks submit and shows validation error when items list is empty', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<KeyOrderForm mode="create" onSubmit={onSubmit} />, {
      wrapper: makeWrapper(),
    });

    const submitBtn = screen.getByRole('button', { name: /crear y confirmar orden/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/agregá al menos un ítem/i)).toBeInTheDocument();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  // T-13c-1e: clicking "Agregar ítem" (header button) appends a new item card
  it('appends a new item card when the header "Agregar ítem" is clicked', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<KeyOrderForm mode="create" onSubmit={onSubmit} />, {
      wrapper: makeWrapper(),
    });

    // Empty state: no item cards; ghost slot present as the only affordance
    // for adding an item alongside the header button.
    expect(screen.queryByTestId('key-order-item-0')).not.toBeInTheDocument();
    expect(screen.getByTestId('key-order-item-ghost')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /agregar ítem/i }));

    expect(screen.getByTestId('key-order-item-0')).toBeInTheDocument();
    expect(screen.getByText('Ítem 1')).toBeInTheDocument();
    // Fields visible — card is expanded by default
    expect(screen.getByLabelText(/cantidad de llaves/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/precio unitario/i)).toBeInTheDocument();
  });

  // T-13c-1e2: the ghost slot is visual-only (not clickable) — the section
  // header button is the single entry point for adding items.
  it('ghost slot is visual-only (not a button/link)', () => {
    const onSubmit = vi.fn();
    render(<KeyOrderForm mode="create" onSubmit={onSubmit} />, {
      wrapper: makeWrapper(),
    });

    const ghost = screen.getByTestId('key-order-item-ghost');
    expect(ghost).toBeInTheDocument();
    expect(ghost.tagName).toBe('DIV');
  });

  // T-13c-1f: removing an item works
  it('removes an item card when "Eliminar" is clicked', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <KeyOrderForm mode="edit" initialOrder={makeInitialOrder()} onSubmit={onSubmit} />,
      { wrapper: makeWrapper() },
    );

    expect(screen.getByText('Ítem 1')).toBeInTheDocument();
    const removeBtn = screen.getByRole('button', { name: /eliminar ítem 1/i });
    await user.click(removeBtn);
    expect(screen.queryByText('Ítem 1')).not.toBeInTheDocument();
    // Ghost slot remains as the empty-state hint
    expect(screen.getByTestId('key-order-item-ghost')).toBeInTheDocument();
  });

  // Totals footer shows live totals (visibility of system status).
  it('shows live item, key and price totals below the item list', () => {
    const onSubmit = vi.fn();
    render(
      <KeyOrderForm mode="edit" initialOrder={makeInitialOrder()} onSubmit={onSubmit} />,
      { wrapper: makeWrapper() },
    );

    const totals = screen.getByTestId('lines-totals');
    // makeInitialOrder has one item: quantity 2, unit_price 150 → 2 llaves, $300,00.
    expect(totals).toHaveTextContent(/1 ítem · 2 llaves/);
    expect(totals).toHaveTextContent(/Total:/);
    expect(totals).toHaveTextContent(/300,00/);
  });

  // Section header carries a persistent "Agregar ítem" button.
  it('shows the "Agregar ítem" button in the section header', () => {
    const onSubmit = vi.fn();
    render(
      <KeyOrderForm mode="edit" initialOrder={makeInitialOrder()} onSubmit={onSubmit} />,
      { wrapper: makeWrapper() },
    );

    expect(
      screen.getByRole('button', { name: /agregar ítem/i }),
    ).toBeInTheDocument();
  });

  // T-13c-1g: create mode calls onSubmit (form-level, not mutation-level)
  it('create mode calls onSubmit with correct payload shape when form is valid', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    const validValues: KeyOrderFormValues = {
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
    };

    render(
      <KeyOrderForm mode="create" initialValues={validValues} onSubmit={onSubmit} />,
      { wrapper: makeWrapper() },
    );

    const submitBtn = screen.getByRole('button', { name: /crear y confirmar orden/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledOnce();
    });

    const calledWith = onSubmit.mock.calls[0]![0] as KeyOrderFormValues;
    expect(calledWith.client_type).toBe('administration');
    expect(calledWith.administration_id).toBe('adm-1');
    expect(calledWith.items).toHaveLength(1);
    expect(calledWith.items[0]!.item_type).toBe('key');
  });

  // T-13c-1h: validation requires administration_id when client_type=administration
  it('shows error when administration client type selected but no administration chosen', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <KeyOrderForm
        mode="create"
        initialValues={{
          client_type: 'administration',
          administration_id: null,
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
        }}
        onSubmit={onSubmit}
      />,
      { wrapper: makeWrapper() },
    );

    const submitBtn = screen.getByRole('button', { name: /crear y confirmar orden/i });
    await user.click(submitBtn);

    await waitFor(() => {
      const errors = screen.getAllByText(/seleccioná una administración/i);
      expect(errors.some((el) => el.tagName === 'P')).toBe(true);
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  // Item-level validation surfaces on submit: building_id required per item.
  it('shows building_id error on the item when submitting without a building', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <KeyOrderForm
        mode="create"
        initialValues={{
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
              building_id: null,
              unit_price: 100,
              unit_id: null,
              pickup_particular_id: null,
              product_id: 'prod-1',
            },
          ],
        }}
        onSubmit={onSubmit}
      />,
      { wrapper: makeWrapper() },
    );

    await user.click(
      screen.getByRole('button', { name: /crear y confirmar orden/i }),
    );

    await waitFor(() => {
      expect(
        screen.getByText(/el edificio es obligatorio/i),
      ).toBeInTheDocument();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  // Item-level validation: unit_price must be > 0.
  it('shows unit_price error on the item when price is zero or missing', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <KeyOrderForm
        mode="create"
        initialValues={{
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
              unit_price: null,
              unit_id: null,
              pickup_particular_id: null,
              product_id: 'prod-1',
            },
          ],
        }}
        onSubmit={onSubmit}
      />,
      { wrapper: makeWrapper() },
    );

    await user.click(
      screen.getByRole('button', { name: /crear y confirmar orden/i }),
    );

    await waitFor(() => {
      expect(
        screen.getByText(/el precio debe ser mayor a 0/i),
      ).toBeInTheDocument();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('switches client type via the radio group and requires a particular', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<KeyOrderForm mode="create" onSubmit={onSubmit} />, {
      wrapper: makeWrapper(),
    });

    // Empty state: no item cards → no per-item pickup selector yet.
    // Client is 'administration' by default → no client-level particular selector either.
    expect(screen.queryAllByTestId('particular-selector').length).toBe(0);

    const particularRadio = screen.getByRole('radio', { name: /particular/i });
    await user.click(particularRadio);

    expect(particularRadio).toBeChecked();
    // Client section now offers the particular selector.
    expect(screen.getAllByTestId('particular-selector').length).toBe(1);

    // Submit without selecting a particular → client-level validation error, no onSubmit.
    await user.click(screen.getByRole('button', { name: /crear y confirmar orden/i }));

    await waitFor(() => {
      expect(screen.getByText(/seleccioná un particular/i)).toBeInTheDocument();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
