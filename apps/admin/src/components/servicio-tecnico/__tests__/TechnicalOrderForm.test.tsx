import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
    data: [
      {
        id: 'staff-1',
        full_name: 'García Juan',
        email: null,
        phone: null,
        role: 'installer',
        status: 'active',
        notes: null,
        created_at: '2026-01-01',
      },
    ],
  }),
}));

vi.mock('@/hooks/useEquipment', () => ({
  useEquipment: () => ({
    data: [
      {
        id: 'equip-1',
        model: 'Equipo Modelo A',
        serial_number: 'SN001',
        status: 'active',
        installed_at: '2026-01-01',
        building_id: 'bld-1',
      },
    ],
  }),
}));

vi.mock('@/hooks/useProducts', () => ({
  useProducts: () => ({ data: [{ id: 'prod-1', name: 'Producto A', stock_disponible: 5 }] }),
}));

vi.mock('@/components/particulares/ParticularSelector', () => ({
  ParticularSelector: ({ onChange }: { onChange: (p: unknown) => void }) => (
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
    <button type="button" data-testid="building-combobox" onClick={() => onChange('bld-1')}>
      {value ?? 'Seleccionar edificio'}
    </button>
  ),
}));

// Import after mocks
import { TechnicalOrderForm } from '../TechnicalOrderForm';
import { makeDataRouterWrapper } from '@/test/renderWithDataRouter';
import type { TechnicalOrderFormValues } from '../TechnicalOrderForm';
import { expectInvalidFieldWired } from '@/test/expectFieldErrorWiring';

let getRouter: ReturnType<typeof makeDataRouterWrapper>['getRouter'];

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const dataRouter = makeDataRouterWrapper({
    routes: [{ path: '/otra', element: <p>otra pagina</p> }],
    wrap: (children) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
  });
  getRouter = dataRouter.getRouter;
  return dataRouter.Wrapper;
}

function makeInitialOrder(
  overrides: Partial<TechnicalOrderDetailRow> = {},
): TechnicalOrderDetailRow {
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
    expect(screen.getByRole('button', { name: /crear y confirmar orden/i })).toBeInTheDocument();
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
    expect(screen.getByRole('button', { name: /guardar cambios/i })).toBeInTheDocument();
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
    await user.click(await screen.findByRole('button', { name: /mantenimiento/i }));
    expect(screen.getByText('Ítem 1')).toBeInTheDocument();
  });

  // Live total mirrors KeyOrderForm's `lines-totals` block.
  it('shows a live total that updates as items are added and repriced', async () => {
    const user = userEvent.setup();
    const base = makeInitialOrder();
    const initialOrder = makeInitialOrder({
      technical_order_items: [{ ...base.technical_order_items[0]!, unit_price: 80 }],
    });
    render(<TechnicalOrderForm mode="edit" initialOrder={initialOrder} onSubmit={vi.fn()} />, {
      wrapper: makeWrapper(),
    });

    expect(screen.getByTestId('lines-totals')).toHaveTextContent('Total: $ 80,00');

    // A newly added item has no price yet: it counts as 0.
    await user.click(screen.getByRole('button', { name: /agregar ítem/i }));
    await user.click(await screen.findByRole('button', { name: /mantenimiento/i }));
    expect(screen.getByTestId('lines-totals')).toHaveTextContent('Total: $ 80,00');

    await user.type(screen.getByLabelText(/precio unitario/i), '20');
    expect(screen.getByTestId('lines-totals')).toHaveTextContent('Total: $ 100,00');
  });

  it('hides the live total when there are no items', () => {
    render(<TechnicalOrderForm mode="create" onSubmit={vi.fn()} />, { wrapper: makeWrapper() });
    expect(screen.queryByTestId('lines-totals')).not.toBeInTheDocument();
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
    await user.click(await screen.findByRole('button', { name: /mantenimiento/i }));

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
    await user.click(await screen.findByRole('button', { name: /mantenimiento/i }));

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
              product_id: null, // missing — should fail
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
              unit_price: 100, // required for install_equipment (billable)
              product_id: 'prod-1', // provided — should pass
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
          product_id: null, // still missing
          intended_equipment_id: null,
          intended_assignee_staff_id: 'staff-1',
        },
      ],
    };

    render(<TechnicalOrderForm mode="create" initialValues={values} onSubmit={onSubmit} />, {
      wrapper: makeWrapper(),
    });

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
              intended_equipment_id: null, // required for replace_equipment
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

    render(<TechnicalOrderForm mode="create" initialValues={validValues} onSubmit={onSubmit} />, {
      wrapper: makeWrapper(),
    });

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

  describe('navigation blocker (data router)', () => {
    const NOTES = /observaciones adicionales/i;

    it('blocks in-app navigation while dirty and keeps the location', async () => {
      const user = userEvent.setup();
      render(<TechnicalOrderForm mode="create" onSubmit={vi.fn()} onCancel={vi.fn()} />, {
        wrapper: makeWrapper(),
      });
      await user.type(screen.getByPlaceholderText(NOTES), 'algo');

      await act(() => getRouter().navigate('/otra'));

      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByText('¿Descartar los cambios?')).toBeInTheDocument();
      expect(getRouter().state.location.pathname).toBe('/');
    });

    it('proceeds to the target when the user confirms', async () => {
      const user = userEvent.setup();
      render(<TechnicalOrderForm mode="create" onSubmit={vi.fn()} onCancel={vi.fn()} />, {
        wrapper: makeWrapper(),
      });
      await user.type(screen.getByPlaceholderText(NOTES), 'algo');
      await act(() => getRouter().navigate('/otra'));

      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'Descartar cambios' }));

      await waitFor(() => expect(getRouter().state.location.pathname).toBe('/otra'));
    });

    it('stays with the input intact when the user dismisses', async () => {
      const user = userEvent.setup();
      render(<TechnicalOrderForm mode="create" onSubmit={vi.fn()} onCancel={vi.fn()} />, {
        wrapper: makeWrapper(),
      });
      const notes = screen.getByPlaceholderText(NOTES);
      await user.type(notes, 'algo');
      await act(() => getRouter().navigate('/otra'));

      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'Seguir editando' }));

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(getRouter().state.location.pathname).toBe('/');
      expect(notes).toHaveValue('algo');
    });

    it('does not block a clean form', async () => {
      render(<TechnicalOrderForm mode="create" onSubmit={vi.fn()} onCancel={vi.fn()} />, {
        wrapper: makeWrapper(),
      });

      await act(() => getRouter().navigate('/otra'));

      expect(getRouter().state.location.pathname).toBe('/otra');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('does not block a search-only change while dirty', async () => {
      const user = userEvent.setup();
      render(<TechnicalOrderForm mode="create" onSubmit={vi.fn()} onCancel={vi.fn()} />, {
        wrapper: makeWrapper(),
      });
      await user.type(screen.getByPlaceholderText(NOTES), 'algo');

      await act(() => getRouter().navigate('/?filtro=1'));

      expect(getRouter().state.location.search).toBe('?filtro=1');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('guards browser back (POP) while dirty', async () => {
      const user = userEvent.setup();
      const { Wrapper, getRouter: routerOf } = makeDataRouterWrapper({
        initialEntries: ['/otra', '/'],
        routes: [{ path: '/otra', element: <p>otra pagina</p> }],
      });
      render(<TechnicalOrderForm mode="create" onSubmit={vi.fn()} onCancel={vi.fn()} />, {
        wrapper: Wrapper,
      });
      await user.type(screen.getByPlaceholderText(NOTES), 'algo');

      await act(() => routerOf().navigate(-1));

      expect(await screen.findByRole('dialog')).toBeInTheDocument();
      expect(routerOf().state.location.pathname).toBe('/');
    });

    it('does not block the redirect that follows a successful submit', async () => {
      const user = userEvent.setup();
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

      const onSubmit = vi.fn(async () => {
        await getRouter().navigate('/otra');
      });
      render(<TechnicalOrderForm mode="create" initialValues={validValues} onSubmit={onSubmit} />, {
        wrapper: makeWrapper(),
      });
      await user.type(screen.getByPlaceholderText(NOTES), 'algo');

      await user.click(screen.getByRole('button', { name: /crear y confirmar orden/i }));

      await waitFor(() => expect(getRouter().state.location.pathname).toBe('/otra'));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  describe('unsaved changes guard (Cancelar)', () => {
    it('opens a ConfirmDialog instead of window.confirm when dirty, then leaves on confirm', async () => {
      const user = userEvent.setup();
      const onCancel = vi.fn();
      const confirmSpy = vi.spyOn(window, 'confirm');
      render(<TechnicalOrderForm mode="create" onSubmit={vi.fn()} onCancel={onCancel} />, {
        wrapper: makeWrapper(),
      });

      await user.type(screen.getByPlaceholderText(/observaciones adicionales/i), 'algo');
      await user.click(screen.getByRole('button', { name: 'Cancelar' }));

      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByText('¿Descartar los cambios?')).toBeInTheDocument();
      expect(confirmSpy).not.toHaveBeenCalled();
      expect(onCancel).not.toHaveBeenCalled();

      await user.click(within(dialog).getByRole('button', { name: 'Descartar cambios' }));
      expect(onCancel).toHaveBeenCalledTimes(1);
      confirmSpy.mockRestore();
    });

    it('keeps the user and the typed input when the dialog is dismissed', async () => {
      const user = userEvent.setup();
      const onCancel = vi.fn();
      render(<TechnicalOrderForm mode="create" onSubmit={vi.fn()} onCancel={onCancel} />, {
        wrapper: makeWrapper(),
      });

      const notes = screen.getByPlaceholderText(/observaciones adicionales/i);
      await user.type(notes, 'algo');
      await user.click(screen.getByRole('button', { name: 'Cancelar' }));
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'Seguir editando' }));

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(onCancel).not.toHaveBeenCalled();
      expect(notes).toHaveValue('algo');
    });

    it('leaves immediately with no dialog when the form is clean', async () => {
      const user = userEvent.setup();
      const onCancel = vi.fn();
      const confirmSpy = vi.spyOn(window, 'confirm');
      render(<TechnicalOrderForm mode="create" onSubmit={vi.fn()} onCancel={onCancel} />, {
        wrapper: makeWrapper(),
      });

      await user.click(screen.getByRole('button', { name: 'Cancelar' }));

      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(confirmSpy).not.toHaveBeenCalled();
      confirmSpy.mockRestore();
    });
  });

  describe('item chip tokens', () => {
    it('renders the item chip with info token classes and no raw palette or arbitrary px', () => {
      render(
        <TechnicalOrderForm mode="edit" initialOrder={makeInitialOrder()} onSubmit={vi.fn()} />,
        {
          wrapper: makeWrapper(),
        },
      );

      const chip = screen.getByText('Ítem 1').nextElementSibling as HTMLElement;
      expect(chip.textContent?.trim()).not.toBe('');
      expect(chip).toHaveClass('bg-info/10', 'text-info', 'max-w-48');
      expect(chip.className).not.toMatch(/blue-/);
      expect(chip.className).not.toMatch(/\[\d+px\]/);
    });
  });

  it('wires the field error to its control on an invalid submit (FormField)', async () => {
    const user = userEvent.setup();
    render(<TechnicalOrderForm mode="create" onSubmit={vi.fn()} />, { wrapper: makeWrapper() });
    await user.click(screen.getByRole('button', { name: /crear y confirmar orden/i }));
    await waitFor(() => expectInvalidFieldWired());
  });
});
