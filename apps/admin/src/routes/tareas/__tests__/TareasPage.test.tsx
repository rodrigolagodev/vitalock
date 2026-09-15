import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { useTareasMock, useStaffMock, useBuildingsMock } = vi.hoisted(() => ({
  useTareasMock: vi.fn(),
  useStaffMock: vi.fn(),
  useBuildingsMock: vi.fn(),
}));

vi.mock('@/hooks/useTareas', () => ({
  useTareas: useTareasMock,
}));
vi.mock('@/hooks/useStaff', () => ({
  useStaff: useStaffMock,
}));
vi.mock('@/hooks/useBuildings', () => ({
  useBuildings: useBuildingsMock,
}));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import TareasPage from '../TareasPage';

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TareasPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useTareasMock.mockReturnValue({ data: [], isFetching: false, isError: false });
  useStaffMock.mockReturnValue({ data: [{ id: 'staff-1', full_name: 'Juan Pérez' }] });
  useBuildingsMock.mockReturnValue({ data: [{ id: 'bld-1', name: 'Torre Norte' }] });
});

describe('TareasPage rendering', () => {
  it('renders the page heading', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: /^tareas$/i })).toBeInTheDocument();
  });

  it('renders the "Nueva tarea" button', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /nueva tarea/i })).toBeInTheDocument();
  });

  it('renders the search input', () => {
    renderPage();
    expect(
      screen.getByPlaceholderText(/buscar por número, descripción, edificio o asignado/i),
    ).toBeInTheDocument();
  });

  it('shows error message when isError is true', () => {
    useTareasMock.mockReturnValueOnce({ data: [], isFetching: false, isError: true });
    renderPage();
    expect(screen.getByText(/error al cargar/i)).toBeInTheDocument();
  });
});

describe('TareasPage staff/building filters (FilterBar.Select, single-value)', () => {
  it('passes the selected staff to useTareas', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('combobox', { name: /^asignado$/i }));
    await user.click(screen.getByRole('option', { name: /^juan pérez$/i }));

    const lastCall = useTareasMock.mock.calls.at(-1)?.[0];
    expect(lastCall?.staffId).toBe('staff-1');
  });

  it('passes the selected building to useTareas', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('combobox', { name: /^edificio$/i }));
    await user.click(screen.getByRole('option', { name: /^torre norte$/i }));

    const lastCall = useTareasMock.mock.calls.at(-1)?.[0];
    expect(lastCall?.buildingId).toBe('bld-1');
  });
});

describe('TareasPage status filter (FilterBar.MultiSelect, 4 real values)', () => {
  it('renders an "Estado" multi-select facet with exactly the 4 live statuses', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /^estado$/i }));
    const group = screen.getByRole('group', { name: /^estado$/i });
    expect(within(group).getByRole('checkbox', { name: /^pendientes$/i })).toBeInTheDocument();
    expect(within(group).getByRole('checkbox', { name: /^en curso$/i })).toBeInTheDocument();
    expect(within(group).getByRole('checkbox', { name: /^finalizadas$/i })).toBeInTheDocument();
    expect(within(group).getByRole('checkbox', { name: /^canceladas$/i })).toBeInTheDocument();
    expect(within(group).getAllByRole('checkbox')).toHaveLength(4);
  });

  it('passes a single selected status to useTareas when one checkbox is checked', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /^estado$/i }));
    await user.click(screen.getByRole('checkbox', { name: /^pendientes$/i }));

    const lastCall = useTareasMock.mock.calls.at(-1)?.[0];
    expect(lastCall?.status).toEqual(['open']);
  });

  it('passes multiple selected statuses to useTareas when two checkboxes are checked', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /^estado$/i }));
    await user.click(screen.getByRole('checkbox', { name: /^pendientes$/i }));
    await user.click(screen.getByRole('checkbox', { name: /^en curso$/i }));

    const lastCall = useTareasMock.mock.calls.at(-1)?.[0];
    expect(lastCall?.status).toEqual(['open', 'in_progress']);
  });
});

describe('TareasPage FilterBar.Summary', () => {
  it('shows no "Limpiar todo" button when no filters are active', () => {
    renderPage();
    expect(screen.queryByRole('button', { name: /limpiar todo/i })).not.toBeInTheDocument();
  });

  // Multi-facet "Limpiar todo" regression test (required by this batch): this
  // page holds filter state in plain useState (search/status/staffId/
  // buildingId), NOT useSearchParams, so it should NOT hit the Batch 12
  // react-router-dom setSearchParams non-composition bug — each onClear
  // resolves against its own independent React state setter and React
  // batches them into one re-render. Confirmed here the same way Batch 13
  // (EquiposPage) confirmed it: activate multiple facets, click "Limpiar
  // todo" once, and assert EVERY facet actually cleared in the final call.
  it('clears every active facet (staff, building, status) when "Limpiar todo" is clicked once', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('combobox', { name: /^asignado$/i }));
    await user.click(screen.getByRole('option', { name: /^juan pérez$/i }));

    await user.click(screen.getByRole('combobox', { name: /^edificio$/i }));
    await user.click(screen.getByRole('option', { name: /^torre norte$/i }));

    await user.click(screen.getByRole('button', { name: /^estado$/i }));
    await user.click(screen.getByRole('checkbox', { name: /^pendientes$/i }));

    const clearAll = screen.getByRole('button', { name: /limpiar todo/i });
    await user.click(clearAll);

    const lastCall = useTareasMock.mock.calls.at(-1)?.[0];
    expect(lastCall?.staffId).toBeUndefined();
    expect(lastCall?.buildingId).toBeUndefined();
    expect(lastCall?.status).toEqual([]);
    expect(screen.queryByRole('button', { name: /limpiar todo/i })).not.toBeInTheDocument();
  });
});
