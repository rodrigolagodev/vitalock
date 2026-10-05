import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
    <button type="button" data-testid="building-combobox" onClick={() => onChange('bld-1')}>
      {value ?? 'Seleccionar edificio'}
    </button>
  ),
}));

// Import after mocks
import { KeyOrderForm } from '../KeyOrderForm';
import { makeDataRouterWrapper } from '@/test/renderWithDataRouter';
import type { KeyOrderFormValues } from '../KeyOrderForm';
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
    expect(screen.getByRole('button', { name: /crear y confirmar orden/i })).toBeInTheDocument();
    expect(screen.getByText('Cliente')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /ítems/i })).toBeInTheDocument();
  });

  // T-13c-1b: edit mode renders correct submit label and pre-populates notes
  it('renders in edit mode with "Guardar cambios" button and pre-populated notes', () => {
    const onSubmit = vi.fn();
    const initialOrder = makeInitialOrder();
    render(<KeyOrderForm mode="edit" initialOrder={initialOrder} onSubmit={onSubmit} />, {
      wrapper: makeWrapper(),
    });
    expect(screen.getByRole('button', { name: /guardar cambios/i })).toBeInTheDocument();
    const notesTextarea = screen.getByPlaceholderText(/observaciones adicionales/i);
    expect(notesTextarea).toHaveValue('Nota de prueba');
  });

  // T-13c-1c: edit mode shows pre-populated item card
  it('renders pre-populated item card in edit mode', () => {
    const onSubmit = vi.fn();
    render(<KeyOrderForm mode="edit" initialOrder={makeInitialOrder()} onSubmit={onSubmit} />, {
      wrapper: makeWrapper(),
    });
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
    render(<KeyOrderForm mode="edit" initialOrder={makeInitialOrder()} onSubmit={onSubmit} />, {
      wrapper: makeWrapper(),
    });

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
    render(<KeyOrderForm mode="edit" initialOrder={makeInitialOrder()} onSubmit={onSubmit} />, {
      wrapper: makeWrapper(),
    });

    const totals = screen.getByTestId('lines-totals');
    // makeInitialOrder has one item: quantity 2, unit_price 150 → 2 llaves, $300,00.
    expect(totals).toHaveTextContent(/1 ítem · 2 llaves/);
    expect(totals).toHaveTextContent(/Total:/);
    expect(totals).toHaveTextContent(/300,00/);
  });

  it('formats the live total like the technical form (shared helper)', () => {
    const base = makeInitialOrder();
    const initialOrder = makeInitialOrder({
      key_order_items: [{ ...base.key_order_items[0]!, quantity: 1, unit_price: 80 }],
    });
    render(<KeyOrderForm mode="edit" initialOrder={initialOrder} onSubmit={vi.fn()} />, {
      wrapper: makeWrapper(),
    });

    expect(screen.getByTestId('lines-totals')).toHaveTextContent('Total: $ 80,00');
  });

  // Section header carries a persistent "Agregar ítem" button.
  it('shows the "Agregar ítem" button in the section header', () => {
    const onSubmit = vi.fn();
    render(<KeyOrderForm mode="edit" initialOrder={makeInitialOrder()} onSubmit={onSubmit} />, {
      wrapper: makeWrapper(),
    });

    expect(screen.getByRole('button', { name: /agregar ítem/i })).toBeInTheDocument();
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

    render(<KeyOrderForm mode="create" initialValues={validValues} onSubmit={onSubmit} />, {
      wrapper: makeWrapper(),
    });

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

    await user.click(screen.getByRole('button', { name: /crear y confirmar orden/i }));

    await waitFor(() => {
      expect(screen.getByText(/el edificio es obligatorio/i)).toBeInTheDocument();
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

    await user.click(screen.getByRole('button', { name: /crear y confirmar orden/i }));

    await waitFor(() => {
      expect(screen.getByText(/el precio debe ser mayor a 0/i)).toBeInTheDocument();
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

  describe('unsaved changes guard (Cancelar)', () => {
    it('opens a ConfirmDialog instead of window.confirm when dirty, then leaves on confirm', async () => {
      const user = userEvent.setup();
      const onCancel = vi.fn();
      const confirmSpy = vi.spyOn(window, 'confirm');
      render(<KeyOrderForm mode="create" onSubmit={vi.fn()} onCancel={onCancel} />, {
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
      render(<KeyOrderForm mode="create" onSubmit={vi.fn()} onCancel={onCancel} />, {
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
      render(<KeyOrderForm mode="create" onSubmit={vi.fn()} onCancel={onCancel} />, {
        wrapper: makeWrapper(),
      });

      await user.click(screen.getByRole('button', { name: 'Cancelar' }));

      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(confirmSpy).not.toHaveBeenCalled();
      confirmSpy.mockRestore();
    });
  });

  describe('navigation blocker (data router)', () => {
    const NOTES = /observaciones adicionales/i;

    it('blocks in-app navigation while dirty and keeps the location', async () => {
      const user = userEvent.setup();
      render(<KeyOrderForm mode="create" onSubmit={vi.fn()} onCancel={vi.fn()} />, {
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
      render(<KeyOrderForm mode="create" onSubmit={vi.fn()} onCancel={vi.fn()} />, {
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
      render(<KeyOrderForm mode="create" onSubmit={vi.fn()} onCancel={vi.fn()} />, {
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
      render(<KeyOrderForm mode="create" onSubmit={vi.fn()} onCancel={vi.fn()} />, {
        wrapper: makeWrapper(),
      });

      await act(() => getRouter().navigate('/otra'));

      expect(getRouter().state.location.pathname).toBe('/otra');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('does not block a search-only change while dirty', async () => {
      const user = userEvent.setup();
      render(<KeyOrderForm mode="create" onSubmit={vi.fn()} onCancel={vi.fn()} />, {
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
      render(<KeyOrderForm mode="create" onSubmit={vi.fn()} onCancel={vi.fn()} />, {
        wrapper: Wrapper,
      });
      await user.type(screen.getByPlaceholderText(NOTES), 'algo');

      await act(() => routerOf().navigate(-1));

      expect(await screen.findByRole('dialog')).toBeInTheDocument();
      expect(routerOf().state.location.pathname).toBe('/');
    });

    it('does not block the redirect that follows a successful submit', async () => {
      const user = userEvent.setup();
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

      const onSubmit = vi.fn(async () => {
        await getRouter().navigate('/otra');
      });
      render(<KeyOrderForm mode="create" initialValues={validValues} onSubmit={onSubmit} />, {
        wrapper: makeWrapper(),
      });
      await user.type(screen.getByPlaceholderText(NOTES), 'algo');

      await user.click(screen.getByRole('button', { name: /crear y confirmar orden/i }));

      await waitFor(() => expect(getRouter().state.location.pathname).toBe('/otra'));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  describe('item chip tokens', () => {
    it('renders the item chip with info token classes and no raw palette or arbitrary px', () => {
      render(<KeyOrderForm mode="edit" initialOrder={makeInitialOrder()} onSubmit={vi.fn()} />, {
        wrapper: makeWrapper(),
      });

      const chip = screen.getByText('Ítem 1').nextElementSibling as HTMLElement;
      expect(chip.textContent?.trim()).not.toBe('');
      expect(chip).toHaveClass('bg-info/10', 'text-info', 'max-w-48');
      expect(chip.className).not.toMatch(/blue-/);
      expect(chip.className).not.toMatch(/\[\d+px\]/);
    });
  });

  it('wires the field error to its control on an invalid submit (FormField)', async () => {
    const user = userEvent.setup();
    render(<KeyOrderForm mode="create" onSubmit={vi.fn()} />, { wrapper: makeWrapper() });
    await user.click(screen.getByRole('button', { name: /crear y confirmar orden/i }));
    await waitFor(() => expectInvalidFieldWired());
  });
});
