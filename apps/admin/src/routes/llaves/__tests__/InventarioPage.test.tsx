import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useSearchParams } from 'react-router-dom';
import React from 'react';
import type { KeysInventoryRow } from '@/hooks/useKeysInventory';

// Hoisted mocks
const {
  useKeysInventoryMock,
  useAdministrationsMock,
  useBuildingsMock,
  useEquipmentByBuildingMock,
} = vi.hoisted(() => ({
  useKeysInventoryMock: vi.fn(),
  useAdministrationsMock: vi.fn(),
  useBuildingsMock: vi.fn(),
  useEquipmentByBuildingMock: vi.fn(),
}));

vi.mock('@/hooks/useKeysInventory', () => ({ useKeysInventory: useKeysInventoryMock }));
vi.mock('@/hooks/useAdministrations', () => ({ useAdministrations: useAdministrationsMock }));
vi.mock('@/hooks/useBuildings', () => ({ useBuildings: useBuildingsMock }));
vi.mock('@/hooks/useEquipmentByBuilding', () => ({
  useEquipmentByBuilding: useEquipmentByBuildingMock,
}));

import InventarioPage from '../InventarioPage';

function makeRow(overrides: Partial<KeysInventoryRow> = {}): KeysInventoryRow {
  return {
    id: 'key-1',
    rfid_code: 'RFID-001',
    physical_status: 'active',
    unit_id: 'unit-1',
    unit_number: '1A',
    building_id: 'bld-1',
    building_name: 'Torre Norte',
    administration_id: 'adm-1',
    administration_company_name: 'Garcia S.A.',
    equipment_id: null,
    equipment_serial_number: null,
    equipment_model: null,
    active_order_id: null,
    active_order_status: null,
    ...overrides,
  };
}

/** Sibling probe reading the SAME router context InventarioPage writes to,
 * so tests can assert the URL itself changed — not just the hook call. */
function SearchParamsProbe() {
  const [searchParams] = useSearchParams();
  return <div data-testid="url-params">{searchParams.toString()}</div>;
}

function renderPage(initialEntries: string[] = ['/']) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    React.createElement(
      MemoryRouter,
      { initialEntries },
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(InventarioPage),
        React.createElement(SearchParamsProbe),
      ),
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useKeysInventoryMock.mockReturnValue({ data: [], isFetching: false, isError: false });
  useAdministrationsMock.mockReturnValue({ data: [{ id: 'adm-1', company_name: 'Garcia S.A.' }] });
  useBuildingsMock.mockReturnValue({ data: [] });
  useEquipmentByBuildingMock.mockReturnValue({ data: [] });
});

describe('InventarioPage rendering', () => {
  it('renders the page heading', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: /inventario de llaves/i })).toBeInTheDocument();
  });

  it('renders the "Crear orden de llave" link to /llaves/nueva', () => {
    renderPage();
    const link = screen.getByRole('link', { name: /crear orden de llave/i });
    expect(link).toHaveAttribute('href', '/llaves/nueva');
  });

  it('renders empty state when no data', () => {
    renderPage();
    expect(screen.getByText(/no hay llaves/i)).toBeInTheDocument();
  });

  it('renders rows when data is present', () => {
    useKeysInventoryMock.mockReturnValue({
      data: [makeRow({ rfid_code: 'RFID-001' }), makeRow({ id: 'key-2', rfid_code: 'RFID-002' })],
      isFetching: false,
      isError: false,
    });
    renderPage();
    expect(screen.getByText('RFID-001')).toBeInTheDocument();
    expect(screen.getByText('RFID-002')).toBeInTheDocument();
  });

  it('shows error message when isError is true', () => {
    useKeysInventoryMock.mockReturnValue({
      data: undefined,
      isFetching: false,
      isError: true,
    });
    renderPage();
    expect(screen.getByText(/error al cargar/i)).toBeInTheDocument();
  });
});

describe('InventarioPage cascade filter', () => {
  it('renders the Administración select', () => {
    renderPage();
    expect(screen.getByLabelText(/administración/i)).toBeInTheDocument();
  });

  it('renders the Edificio select (disabled when no admin selected)', () => {
    renderPage();
    expect(screen.getByLabelText(/edificio/i)).toBeDisabled();
  });
});

describe('InventarioPage status filters (FilterBar.Select, single-value by design)', () => {
  it('renders the Estado físico and Estado de orden facets as single-select comboboxes with the FilterBar dashed-trigger style', () => {
    renderPage();
    const physical = screen.getByRole('combobox', { name: /^estado físico$/i });
    const workflow = screen.getByRole('combobox', { name: /^estado de orden$/i });
    expect(physical).toBeInTheDocument();
    expect(workflow).toBeInTheDocument();
    // FilterBar.Select's compact dashed-border trigger is the visible proof
    // this facet actually migrated to FilterBar, not just kept a plain
    // Radix Select with the same accessible name.
    expect(physical).toHaveClass('border-dashed');
    expect(workflow).toHaveClass('border-dashed');
  });

  it('passes the selected physicalStatus to useKeysInventory', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('combobox', { name: /^estado físico$/i }));
    await user.click(screen.getByRole('option', { name: /^activa$/i }));

    const lastCall = useKeysInventoryMock.mock.calls.at(-1)?.[0];
    expect(lastCall?.physicalStatus).toBe('active');
  });

  it('passes the __none__ sentinel to useKeysInventory when "Sin orden activa" is selected', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('combobox', { name: /^estado de orden$/i }));
    await user.click(screen.getByRole('option', { name: /^sin orden activa$/i }));

    const lastCall = useKeysInventoryMock.mock.calls.at(-1)?.[0];
    expect(lastCall?.workflowStatus).toBe('__none__');
  });

  it('replaces rather than accumulates the physicalStatus selection', async () => {
    const user = userEvent.setup();
    renderPage(['/?physicalStatus=active']);

    await user.click(screen.getByRole('combobox', { name: /^estado físico$/i }));
    await user.click(screen.getByRole('option', { name: /^dada de baja$/i }));

    const lastCall = useKeysInventoryMock.mock.calls.at(-1)?.[0];
    expect(lastCall?.physicalStatus).toBe('disabled');
  });
});

describe('InventarioPage URL persistence (useSearchParams stays the source of truth)', () => {
  it('hydrates cascade + status filters from query params present on load', () => {
    renderPage(['/?adminId=adm-1&physicalStatus=active&workflowStatus=__none__']);

    expect(useKeysInventoryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        administrationId: 'adm-1',
        physicalStatus: 'active',
        workflowStatus: '__none__',
      }),
    );
  });

  it('reflects the hydrated physicalStatus value in the Select trigger', () => {
    renderPage(['/?physicalStatus=active']);
    const trigger = screen.getByRole('combobox', { name: /^estado físico$/i });
    expect(trigger).toHaveTextContent('Activa');
  });

  it('writes physicalStatus to the URL when the facet changes', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('combobox', { name: /^estado físico$/i }));
    await user.click(screen.getByRole('option', { name: /^activa$/i }));

    expect(screen.getByTestId('url-params').textContent).toContain('physicalStatus=active');
  });

  it('writes adminId to the URL when the cascade administration changes', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('combobox', { name: /^administración$/i }));
    await user.click(screen.getByRole('option', { name: /^garcia s\.a\.$/i }));

    expect(screen.getByTestId('url-params').textContent).toContain('adminId=adm-1');
  });

  it('removes the URL param when a select facet is cleared back to "Todos"', async () => {
    const user = userEvent.setup();
    renderPage(['/?physicalStatus=active']);

    await user.click(screen.getByRole('combobox', { name: /^estado físico$/i }));
    await user.click(screen.getByRole('option', { name: /^todos$/i }));

    expect(screen.getByTestId('url-params').textContent).not.toContain('physicalStatus');
  });
});

describe('InventarioPage FilterBar.Summary', () => {
  it('shows no "Limpiar todo" button when no filters are active', () => {
    renderPage();
    expect(screen.queryByRole('button', { name: /limpiar todo/i })).not.toBeInTheDocument();
  });

  it('shows "Limpiar todo" once a filter is active and clears it back to the URL default', async () => {
    const user = userEvent.setup();
    renderPage(['/?physicalStatus=active']);

    const clearAll = screen.getByRole('button', { name: /limpiar todo/i });
    expect(clearAll).toBeInTheDocument();

    await user.click(clearAll);

    expect(screen.getByTestId('url-params').textContent).not.toContain('physicalStatus');
    expect(screen.queryByRole('button', { name: /limpiar todo/i })).not.toBeInTheDocument();
  });

  // "Limpiar todo" fires one independent onChange per active facet
  // synchronously (cascade admin + both Selects here, 3 calls in one
  // handler). setSearchParams resolves against a per-render snapshot and
  // does not compose across multiple synchronous calls in the same tick -
  // without InventarioPage's pendingParamsRef chaining, only the LAST call's
  // URL would survive and the other two params would silently remain.
  // This is the actual scenario that originally exposed the bug; the
  // single-filter case above does not exercise multi-call composition.
  it('clears every active facet from the URL when multiple filters are active at once', async () => {
    const user = userEvent.setup();
    renderPage(['/?adminId=adm-1&physicalStatus=active&workflowStatus=__none__']);

    const clearAll = screen.getByRole('button', { name: /limpiar todo/i });
    await user.click(clearAll);

    const urlText = screen.getByTestId('url-params').textContent ?? '';
    expect(urlText).not.toContain('adminId');
    expect(urlText).not.toContain('physicalStatus');
    expect(urlText).not.toContain('workflowStatus');
    expect(screen.queryByRole('button', { name: /limpiar todo/i })).not.toBeInTheDocument();
  });
});

describe('InventarioPage error state', () => {
  it('shows an error message when isError is true', () => {
    useKeysInventoryMock.mockReturnValue({
      data: undefined,
      isFetching: false,
      isError: true,
    });
    renderPage();
    expect(screen.getByText(/error al cargar/i)).toBeInTheDocument();
  });
});
