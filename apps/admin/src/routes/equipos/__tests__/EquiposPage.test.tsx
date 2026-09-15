import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const {
  useEquipmentInventoryMock,
  useAdministrationsMock,
  useBuildingsMock,
  useEquipmentByBuildingMock,
} = vi.hoisted(() => ({
  useEquipmentInventoryMock: vi.fn(),
  useAdministrationsMock: vi.fn(),
  useBuildingsMock: vi.fn(),
  useEquipmentByBuildingMock: vi.fn(),
}));

// Mock hooks
vi.mock('@/hooks/useEquipmentInventory', () => ({
  useEquipmentInventory: useEquipmentInventoryMock,
}));
vi.mock('@/hooks/useAdministrations', () => ({
  useAdministrations: useAdministrationsMock,
}));
vi.mock('@/hooks/useBuildings', () => ({
  useBuildings: useBuildingsMock,
}));
vi.mock('@/hooks/useEquipmentByBuilding', () => ({
  useEquipmentByBuilding: useEquipmentByBuildingMock,
}));

import EquiposPage from '../EquiposPage';

function renderPage() {
  return render(
    <MemoryRouter>
      <EquiposPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useEquipmentInventoryMock.mockReturnValue({ data: [], isFetching: false, isError: false });
  useAdministrationsMock.mockReturnValue({ data: [{ id: 'adm-1', company_name: 'Garcia S.A.' }] });
  useBuildingsMock.mockReturnValue({
    data: [{ id: 'bld-1', name: 'Torre Norte', administration_id: 'adm-1' }],
  });
  useEquipmentByBuildingMock.mockReturnValue({ data: [] });
});

describe('EquiposPage rendering', () => {
  it('renders the page heading', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: /inventario de equipos/i })).toBeInTheDocument();
  });

  it('renders the "Crear orden técnica" shortcut button', () => {
    renderPage();
    expect(screen.getByRole('link', { name: /crear orden técnica/i })).toBeInTheDocument();
  });

  it('"Crear orden técnica" link points to /servicio-tecnico/nueva', () => {
    renderPage();
    const link = screen.getByRole('link', { name: /crear orden técnica/i });
    expect(link).toHaveAttribute('href', '/servicio-tecnico/nueva');
  });

  it('renders the equipment status filter', () => {
    renderPage();
    expect(screen.getByLabelText(/estado del equipo/i)).toBeInTheDocument();
  });

  it('renders the cascade filter (administración select)', () => {
    renderPage();
    expect(screen.getByLabelText(/administración/i)).toBeInTheDocument();
  });

  it('renders the equipment inventory table', () => {
    renderPage();
    expect(screen.getByText(/no hay equipos/i)).toBeInTheDocument();
  });

  it('shows error message when isError is true', () => {
    useEquipmentInventoryMock.mockReturnValueOnce({
      data: [],
      isFetching: false,
      isError: true,
    });
    renderPage();
    expect(screen.getByText(/error al cargar/i)).toBeInTheDocument();
  });
});

describe('EquiposPage status filter (FilterBar.Select, single-value by design — 3 real values)', () => {
  it('renders the Estado del equipo facet as a single-select combobox with the FilterBar dashed-trigger style', () => {
    renderPage();
    const trigger = screen.getByRole('combobox', { name: /^estado del equipo$/i });
    expect(trigger).toBeInTheDocument();
    // FilterBar.Select's compact dashed-border trigger is the visible proof
    // this facet actually migrated to FilterBar, not just kept a plain
    // Radix Select with the same accessible name.
    expect(trigger).toHaveClass('border-dashed');
  });

  it('lists exactly the 3 live equipment statuses plus "Todos"', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('combobox', { name: /^estado del equipo$/i }));
    expect(screen.getByRole('option', { name: /^todos$/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /^activo$/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /^mantenimiento$/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /^dado de baja$/i })).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(4);
  });

  it('passes the selected status to useEquipmentInventory', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('combobox', { name: /^estado del equipo$/i }));
    await user.click(screen.getByRole('option', { name: /^mantenimiento$/i }));

    const lastCall = useEquipmentInventoryMock.mock.calls.at(-1)?.[0];
    expect(lastCall?.status).toBe('maintenance');
  });

  it('replaces rather than accumulates the status selection', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('combobox', { name: /^estado del equipo$/i }));
    await user.click(screen.getByRole('option', { name: /^activo$/i }));
    await user.click(screen.getByRole('combobox', { name: /^estado del equipo$/i }));
    await user.click(screen.getByRole('option', { name: /^dado de baja$/i }));

    const lastCall = useEquipmentInventoryMock.mock.calls.at(-1)?.[0];
    expect(lastCall?.status).toBe('dead');
  });
});

describe('EquiposPage cascade filter', () => {
  it('passes the selected administration to useEquipmentInventory', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('combobox', { name: /^administración$/i }));
    await user.click(screen.getByRole('option', { name: /^garcia s\.a\.$/i }));

    const lastCall = useEquipmentInventoryMock.mock.calls.at(-1)?.[0];
    expect(lastCall?.administrationId).toBe('adm-1');
  });

  it('disables the Edificio level until an administration is selected', () => {
    renderPage();
    expect(screen.getByLabelText(/edificio/i)).toBeDisabled();
  });
});

describe('EquiposPage FilterBar.Summary', () => {
  it('shows no "Limpiar todo" button when no filters are active', () => {
    renderPage();
    expect(screen.queryByRole('button', { name: /limpiar todo/i })).not.toBeInTheDocument();
  });

  it('shows "Limpiar todo" once the status filter is active and clears it back to "Todos"', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('combobox', { name: /^estado del equipo$/i }));
    await user.click(screen.getByRole('option', { name: /^activo$/i }));

    const clearAll = screen.getByRole('button', { name: /limpiar todo/i });
    await user.click(clearAll);

    const lastCall = useEquipmentInventoryMock.mock.calls.at(-1)?.[0];
    expect(lastCall?.status).toBe('all');
    expect(screen.queryByRole('button', { name: /limpiar todo/i })).not.toBeInTheDocument();
  });

  // "Limpiar todo" fires one independent onChange per active facet
  // synchronously (cascade administration + status, 2 calls in one click
  // handler). This page holds filter state in plain useState (not
  // useSearchParams), so each onClear resolves against its own React state
  // setter rather than a shared closure snapshot — unlike InventarioPage's
  // useSearchParams composition gap (Batch 12), both setState calls apply
  // independently and React batches them into a single re-render. This test
  // proves that holds for the cascade+status combination on this page.
  it('clears every active facet when the cascade administration and status are both active', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('combobox', { name: /^administración$/i }));
    await user.click(screen.getByRole('option', { name: /^garcia s\.a\.$/i }));

    await user.click(screen.getByRole('combobox', { name: /^estado del equipo$/i }));
    await user.click(screen.getByRole('option', { name: /^mantenimiento$/i }));

    const clearAll = screen.getByRole('button', { name: /limpiar todo/i });
    await user.click(clearAll);

    const lastCall = useEquipmentInventoryMock.mock.calls.at(-1)?.[0];
    expect(lastCall?.administrationId).toBeUndefined();
    expect(lastCall?.status).toBe('all');
    expect(screen.queryByRole('button', { name: /limpiar todo/i })).not.toBeInTheDocument();
  });
});
