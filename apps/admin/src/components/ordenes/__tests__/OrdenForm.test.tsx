import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import type { ReactNode } from 'react';

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

// ParticularSelector and ParticularFormSheet are complex sub-trees — stub them
vi.mock('@/components/particulares/ParticularSelector', () => ({
  ParticularSelector: ({ onChange, disabled }: { onChange: (p: unknown) => void; disabled?: boolean }) => (
    <button
      type="button"
      data-testid="particular-selector"
      disabled={disabled}
      onClick={() => onChange({ id: 'part-1', full_name: 'López María', dni: '25333444', phone: null, email: null, unit_id: 'u-1', unit_building_id: 'bld-1' })}
    >
      Seleccionar particular
    </button>
  ),
}));

vi.mock('@/components/particulares/ParticularFormSheet', () => ({
  ParticularFormSheet: () => null,
}));

vi.mock('@/components/ordenes/QuickUnitCreateDialog', () => ({
  QuickUnitCreateDialog: () => null,
}));

vi.mock('@/components/buildings/BuildingCombobox', () => ({
  BuildingCombobox: ({ onChange, value }: { onChange: (v: string | null) => void; value?: string | null }) => (
    <button
      type="button"
      data-testid="building-combobox"
      onClick={() => onChange('bld-1')}
    >
      {value ?? 'Seleccionar edificio'}
    </button>
  ),
}));

// Import the component under test AFTER mocks
import { OrdenForm } from '../OrdenForm';
import type { OrdenFormValues } from '../OrdenForm';

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

const sampleEditValues: OrdenFormValues = {
  order_type: 'keys',
  client_type: 'administration',
  administration_id: 'adm-1',
  particular_id: null,
  particular_full_name: '',
  particular_dni: '',
  particular_phone: '',
  particular_email: '',
  notes: 'Nota de prueba',
  items: [
    {
      item_type: 'key',
      quantity: 2,
      description: 'Pack edificio central',
      building_id: 'bld-1',
      unit_price: 150,
      unit_id: null,
      pickup_particular_id: null,
      pickup_same_as_particular: false,
      product_id: 'prod-1',
    },
  ],
};

describe('OrdenForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // T-16a: renders in create mode with empty defaults
  it('renders in create mode with submit button label "Guardar orden"', () => {
    const onSubmit = vi.fn();
    render(
      <OrdenForm mode="create" onSubmit={onSubmit} />,
      { wrapper: makeWrapper() },
    );

    expect(screen.getByRole('button', { name: /guardar orden/i })).toBeInTheDocument();
    // Order type section visible
    expect(screen.getByText('Tipo de orden')).toBeInTheDocument();
    // Client section visible
    expect(screen.getByText('Cliente')).toBeInTheDocument();
  });

  // T-16b: renders in edit mode with initialValues hydrated
  it('renders in edit mode with submit button label "Guardar cambios" and pre-populated notes', () => {
    const onSubmit = vi.fn();
    render(
      <OrdenForm mode="edit" initialValues={sampleEditValues} onSubmit={onSubmit} />,
      { wrapper: makeWrapper() },
    );

    expect(screen.getByRole('button', { name: /guardar cambios/i })).toBeInTheDocument();
    // Notes textarea should be pre-populated
    const notesTextarea = screen.getByPlaceholderText(/observaciones adicionales/i);
    expect(notesTextarea).toHaveValue('Nota de prueba');
  });

  // T-16c: edit mode shows pre-populated items
  it('renders in edit mode with one item card visible in the list', () => {
    const onSubmit = vi.fn();
    render(
      <OrdenForm mode="edit" initialValues={sampleEditValues} onSubmit={onSubmit} />,
      { wrapper: makeWrapper() },
    );

    // The collapsed item card header shows the item summary
    // "Ítem 1" label is always shown in the header
    expect(screen.getByText('Ítem 1')).toBeInTheDocument();
  });

  // T-16d: submit blocked when no items (Zod validation)
  it('blocks submit and shows validation error when items list is empty', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <OrdenForm mode="create" onSubmit={onSubmit} />,
      { wrapper: makeWrapper() },
    );

    const submitBtn = screen.getByRole('button', { name: /guardar orden/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/agregá al menos un ítem/i)).toBeInTheDocument();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  // T-16e: adding an item works
  it('adds an item card when "Agregar ítem" is clicked', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <OrdenForm mode="create" onSubmit={onSubmit} />,
      { wrapper: makeWrapper() },
    );

    expect(screen.queryByText('Ítem 1')).not.toBeInTheDocument();

    const addBtn = screen.getByRole('button', { name: /agregar ítem/i });
    await user.click(addBtn);

    expect(screen.getByText('Ítem 1')).toBeInTheDocument();
  });

  // T-16f: removing an item works
  it('removes an item card when "Eliminar" is clicked', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <OrdenForm mode="edit" initialValues={sampleEditValues} onSubmit={onSubmit} />,
      { wrapper: makeWrapper() },
    );

    // Item card is present before removal
    expect(screen.getByText('Ítem 1')).toBeInTheDocument();

    const removeBtn = screen.getByRole('button', { name: /eliminar/i });
    await user.click(removeBtn);

    expect(screen.queryByText('Ítem 1')).not.toBeInTheDocument();
  });

  // T-16g: submit calls onSubmit with correct values (triangulation)
  it('submit in create mode calls onSubmit with order_type and items payload', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <OrdenForm
        mode="create"
        initialValues={{
          order_type: 'keys',
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
              pickup_same_as_particular: false,
              product_id: 'prod-1',
            },
          ],
        }}
        onSubmit={onSubmit}
      />,
      { wrapper: makeWrapper() },
    );

    const submitBtn = screen.getByRole('button', { name: /guardar orden/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledOnce();
    });

    const calledWith = onSubmit.mock.calls[0]![0] as OrdenFormValues;
    expect(calledWith.order_type).toBe('keys');
    expect(calledWith.administration_id).toBe('adm-1');
    expect(calledWith.items).toHaveLength(1);
    expect(calledWith.items[0]!.item_type).toBe('key');
    expect(calledWith.items[0]!.quantity).toBe(1);
  });
});
