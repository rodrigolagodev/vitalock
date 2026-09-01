import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import type { ReactNode } from 'react';
import type { TechnicalOrderDetailRow } from '@/hooks/useTechnicalOrder';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));

vi.mock('@/hooks/useAdministrations', () => ({
  useAdministrations: () => ({ data: [{ id: 'adm-1', company_name: 'Admin Test S.A.' }] }),
}));

vi.mock('@/hooks/useBuildings', () => ({
  useBuildings: () => ({ data: [{ id: 'bld-1', name: 'Edificio Central', address: 'Av 1 100' }] }),
}));

vi.mock('@/hooks/usePersonal', () => ({
  usePersonal: () => ({
    data: [{ id: 'staff-1', full_name: 'García Juan', email: null, phone: null, role: 'installer', status: 'active', notes: null, created_at: '2026-01-01' }],
  }),
}));

vi.mock('@/hooks/useEquipment', () => ({
  useEquipment: () => ({
    data: [{ id: 'equip-1', model: 'Equipo Modelo A', serial_number: 'SN001', status: 'active', installed_at: '2026-01-01', building_id: 'bld-1' }],
  }),
}));

vi.mock('@/hooks/useProducts', () => ({
  useProducts: () => ({ data: [{ id: 'prod-1', name: 'Producto A', stock_disponible: 5 }] }),
}));

vi.mock('@/components/particulares/ParticularSelector', () => ({
  ParticularSelector: ({
    onChange,
  }: {
    onChange: (p: unknown) => void;
  }) => (
    <button
      type="button"
      data-testid="particular-selector"
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
import { TechnicalOrderForm } from '../TechnicalOrderForm';
import type { TechnicalOrderFormValues } from '../TechnicalOrderForm';

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

function makeInitialOrder(overrides: Partial<TechnicalOrderDetailRow> = {}): TechnicalOrderDetailRow {
  return {
    id: 'to-1',
    order_number: 'ORD-TEC-000001',
    client_type: 'administration',
    administration_id: 'adm-1',
    administrations: { company_name: 'Admin Test S.A.' },
    particular_id: null,
    particulares: null,
    particular_full_name: null,
    particular_dni: null,
    particular_phone: null,
    particular_email: null,
    status: 'draft',
    notes: 'Nota técnica',
    created_at: '2026-08-10T12:00:00Z',
    updated_at: '2026-08-10T12:01:00Z',
    technical_order_items: [
      {
        id: 'item-1',
        order_id: 'to-1',
        item_type: 'maintain_equipment',
        quantity: 1,
        description: 'Mantenimiento general',
        status: 'pending',
        building_id: 'bld-1',
        unit_price: 200,
        product_id: null,
        intended_equipment_id: 'equip-1',
        intended_replacement_equipment_id: null,
        intended_assignee_staff_id: 'staff-1',
      },
    ],
    ...overrides,
  };
}

describe('TechnicalOrderForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // T-14c-1a: create mode renders correct submit label and sections
  it('renders in create mode with "Crear y confirmar orden" submit button', () => {
    const onSubmit = vi.fn();
    render(<TechnicalOrderForm mode="create" onSubmit={onSubmit} />, {
      wrapper: makeWrapper(),
    });
    expect(
      screen.getByRole('button', { name: /crear y confirmar orden/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('Cliente')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /ítems/i })).toBeInTheDocument();
  });

  // T-14c-1b: edit mode renders correct submit label and pre-populates notes
  it('renders in edit mode with "Guardar cambios" button and pre-populated notes', () => {
    const onSubmit = vi.fn();
    render(
      <TechnicalOrderForm mode="edit" initialOrder={makeInitialOrder()} onSubmit={onSubmit} />,
      { wrapper: makeWrapper() },
    );
    expect(
      screen.getByRole('button', { name: /guardar cambios/i }),
    ).toBeInTheDocument();
    const notesTextarea = screen.getByPlaceholderText(/observaciones adicionales/i);
    expect(notesTextarea).toHaveValue('Nota técnica');
  });

  // T-14c-1c: edit mode shows pre-populated item card
  it('renders pre-populated item card in edit mode', () => {
    const onSubmit = vi.fn();
    render(
      <TechnicalOrderForm mode="edit" initialOrder={makeInitialOrder()} onSubmit={onSubmit} />,
      { wrapper: makeWrapper() },
    );
    expect(screen.getByText('Ítem 1')).toBeInTheDocument();
  });

  // T-14c-1d: validation blocks submit when no items
  it('blocks submit and shows validation error when items list is empty', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<TechnicalOrderForm mode="create" onSubmit={onSubmit} />, {
      wrapper: makeWrapper(),
    });

    const submitBtn = screen.getByRole('button', { name: /crear y confirmar orden/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/agregá al menos un ítem/i)).toBeInTheDocument();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  // T-14c-1e: adding an item works via the "Agregar ítem" popover menu
  it('adds an item card when a type is picked from the Agregar ítem menu', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<TechnicalOrderForm mode="create" onSubmit={onSubmit} />, {
      wrapper: makeWrapper(),
    });

    expect(screen.queryByText('Ítem 1')).not.toBeInTheDocument();
    // Open the popover, then click Mantenimiento
    await user.click(screen.getByRole('button', { name: /agregar ítem/i }));
    await user.click(
      await screen.findByRole('button', { name: /mantenimiento/i }),
    );
    expect(screen.getByText('Ítem 1')).toBeInTheDocument();
  });

  // T-14c-1f: removing an item works
  it('removes an item card when "Eliminar" is clicked', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <TechnicalOrderForm mode="edit" initialOrder={makeInitialOrder()} onSubmit={onSubmit} />,
      { wrapper: makeWrapper() },
    );

    expect(screen.getByText('Ítem 1')).toBeInTheDocument();
    const removeBtn = screen.getByRole('button', { name: /eliminar ítem 1/i });
    await user.click(removeBtn);
    expect(screen.queryByText('Ítem 1')).not.toBeInTheDocument();
  });

  // T-14c-1g: validation requires administration_id when client_type=administration
  it('shows error when administration client type selected but no administration chosen', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<TechnicalOrderForm mode="create" onSubmit={onSubmit} />, {
      wrapper: makeWrapper(),
    });

    // Add one item so items validation passes
    await user.click(screen.getByRole('button', { name: /agregar ítem/i }));
    await user.click(
      await screen.findByRole('button', { name: /mantenimiento/i }),
    );

    const submitBtn = screen.getByRole('button', { name: /crear y confirmar orden/i });
    await user.click(submitBtn);

    await waitFor(() => {
      const errors = screen.getAllByText(/seleccioná una administración/i);
      expect(errors.some((el) => el.tagName === 'P')).toBe(true);
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  // T-14c-1h: item validation requires building_id
  it('shows error when item is missing building_id', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <TechnicalOrderForm
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
          items: [],
        }}
        onSubmit={onSubmit}
      />,
      { wrapper: makeWrapper() },
    );

    // Add a maintenance item via the popover menu — auto-expands
    await user.click(screen.getByRole('button', { name: /agregar ítem/i }));
    await user.click(
      await screen.findByRole('button', { name: /mantenimiento/i }),
    );

    // Submit without filling building_id
    await user.click(screen.getByRole('button', { name: /crear y confirmar orden/i }));

    await waitFor(() => {
      expect(screen.getByText(/el edificio es obligatorio/i)).toBeInTheDocument();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  // T-14c-1i: validation requires assignee for confirmImmediately (default)
  it('shows error when item is missing assignee staff and confirmImmediately=true', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <TechnicalOrderForm
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
              item_type: 'install_equipment',
              quantity: 1,
              description: '',
              building_id: 'bld-1',
              unit_price: null,
              product_id: null,
              intended_equipment_id: null,
              intended_assignee_staff_id: null,
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
      expect(screen.getByText(/el responsable es obligatorio/i)).toBeInTheDocument();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  // T-14c-1j: validation requires equipment for maintenance when confirmImmediately=true
  it('shows error when maintenance item is missing equipment and confirmImmediately=true', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <TechnicalOrderForm
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
              item_type: 'maintain_equipment',
              quantity: 1,
              description: '',
              building_id: 'bld-1',
              unit_price: null,
              product_id: null,
              intended_equipment_id: null,
              intended_assignee_staff_id: 'staff-1',
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
      expect(screen.getByText(/el equipo es obligatorio/i)).toBeInTheDocument();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  // 5.9a RED — item_type='installation' + product_id=null fails with product_id-scoped error
  it('shows product_id error when installation item has no product_id', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <TechnicalOrderForm
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
              item_type: 'install_equipment',
              quantity: 1,
              description: '',
              building_id: 'bld-1',
              unit_price: null,
              product_id: null,   // missing — should fail
              intended_equipment_id: null,
              intended_assignee_staff_id: 'staff-1',
            },
          ],
        }}
        onSubmit={onSubmit}
      />,
      { wrapper: makeWrapper() },
    );

    await user.click(screen.getByRole('button', { name: /crear y confirmar orden/i }));

    await waitFor(() => {
      expect(screen.getByText(/elegí un equipo del stock/i)).toBeInTheDocument();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  // 5.9b RED — item_type='installation' + product_id=<uuid> passes validation
  it('allows installation item with product_id set', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <TechnicalOrderForm
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
              item_type: 'install_equipment',
              quantity: 1,
              description: '',
              building_id: 'bld-1',
              unit_price: 100,   // required for install_equipment (billable)
              product_id: 'prod-1',   // provided — should pass
              intended_equipment_id: null,
              intended_assignee_staff_id: 'staff-1',
            },
          ],
        }}
        onSubmit={onSubmit}
      />,
      { wrapper: makeWrapper() },
    );

    await user.click(screen.getByRole('button', { name: /crear y confirmar orden/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledOnce();
    });
  });

  // T-14c-1k (updated): installation item requires product_id (after task 2.2)
  it('requires product_id for installation item — assignee alone is not enough', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    const values: TechnicalOrderFormValues = {
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
          item_type: 'install_equipment',
          quantity: 1,
          description: '',
          building_id: 'bld-1',
          unit_price: null,
          product_id: null,                     // still missing
          intended_equipment_id: null,
          intended_assignee_staff_id: 'staff-1',
        },
      ],
    };

    render(
      <TechnicalOrderForm mode="create" initialValues={values} onSubmit={onSubmit} />,
      { wrapper: makeWrapper() },
    );

    await user.click(screen.getByRole('button', { name: /crear y confirmar orden/i }));

    await waitFor(() => {
      expect(screen.getByText(/elegí un equipo del stock/i)).toBeInTheDocument();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  // T-14c-1l: validation requires equipment for equipment_replacement
  it('shows error when equipment_replacement item is missing equipment', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <TechnicalOrderForm
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
              item_type: 'replace_equipment',
              quantity: 1,
              description: '',
              building_id: 'bld-1',
              unit_price: null,
              product_id: null,
              intended_equipment_id: null,        // required for replace_equipment
              intended_assignee_staff_id: 'staff-1',
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
      expect(screen.getByText(/el equipo es obligatorio/i)).toBeInTheDocument();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  // T-14c-1m: submit payload shape is correct
  it('calls onSubmit with correct payload shape when form is valid', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    const validValues: TechnicalOrderFormValues = {
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
          quantity: 2,
          description: 'Descripción de prueba',
          building_id: 'bld-1',
          unit_price: 300,
          product_id: null,
          intended_equipment_id: 'equip-1',
          intended_assignee_staff_id: 'staff-1',
        },
      ],
    };

    render(
      <TechnicalOrderForm mode="create" initialValues={validValues} onSubmit={onSubmit} />,
      { wrapper: makeWrapper() },
    );

    await user.click(screen.getByRole('button', { name: /crear y confirmar orden/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledOnce();
    });

    const calledWith = onSubmit.mock.calls[0]![0] as TechnicalOrderFormValues;
    expect(calledWith.client_type).toBe('administration');
    expect(calledWith.administration_id).toBe('adm-1');
    expect(calledWith.items).toHaveLength(1);
    expect(calledWith.items[0]!.item_type).toBe('maintain_equipment');
    expect(calledWith.items[0]!.intended_equipment_id).toBe('equip-1');
    expect(calledWith.items[0]!.intended_assignee_staff_id).toBe('staff-1');
  });
});
