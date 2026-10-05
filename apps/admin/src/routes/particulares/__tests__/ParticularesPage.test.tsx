import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { useParticularesMock } = vi.hoisted(() => ({
  useParticularesMock: vi.fn(),
}));

vi.mock('@/hooks/useParticulares', () => ({
  useParticulares: useParticularesMock,
}));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/components/particulares/ParticularFormSheet', () => ({
  ParticularFormSheet: ({ open }: { open: boolean }) =>
    open ? <div data-testid="particular-sheet" /> : null,
}));

import ParticularesPage from '../ParticularesPage';

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ParticularesPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useParticularesMock.mockReturnValue({ data: [], isFetching: false, isError: false });
});

describe('ParticularesPage rendering', () => {
  it('renders the page heading', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: /^particulares$/i })).toBeInTheDocument();
  });

  it('renders the "Nuevo particular" button', () => {
    renderPage();
    // Header button plus the zero-state action (no rows in this fixture).
    expect(screen.getAllByRole('button', { name: /nuevo particular/i })).toHaveLength(2);
  });

  it('renders the search input', () => {
    renderPage();
    expect(screen.getByPlaceholderText(/buscar por nombre o dni/i)).toBeInTheDocument();
  });

  it('shows error message when isError is true', () => {
    useParticularesMock.mockReturnValueOnce({ data: [], isFetching: false, isError: true });
    renderPage();
    expect(screen.getByText(/error al cargar/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});

// ParticularesPage has exactly one facet (search) — no multi-facet "Limpiar
// todo" regression test applies here (that requires 2+ facets). This
// confirms FilterBar.Summary correctly shows/hides around a single Search
// facet, per this batch's instructions.
describe('ParticularesPage FilterBar.Summary (single Search facet)', () => {
  it('shows no "Limpiar todo" button when no filters are active', () => {
    renderPage();
    expect(screen.queryByRole('button', { name: /limpiar todo/i })).not.toBeInTheDocument();
  });

  it('shows "Limpiar todo" once search is active and clears it back to empty', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByPlaceholderText(/buscar por nombre o dni/i), 'García');
    await waitFor(() => {
      expect(useParticularesMock.mock.calls.at(-1)?.[0]?.search).toBe('García');
    });

    const clearAll = screen.getByRole('button', { name: /limpiar todo/i });
    await user.click(clearAll);

    const lastCall = useParticularesMock.mock.calls.at(-1)?.[0];
    expect(lastCall?.search).toBe('');
    expect(screen.queryByRole('button', { name: /limpiar todo/i })).not.toBeInTheDocument();
  });
});

describe('zero state', () => {
  it('shows the title, description and a create action that opens the same sheet as the header button', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(screen.getByText('Todavía no hay particulares')).toBeInTheDocument();
    expect(
      screen.getByText('Los particulares se crean desde una orden o desde acá.'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('particular-sheet')).not.toBeInTheDocument();

    const buttons = screen.getAllByRole('button', { name: 'Nuevo particular' });
    expect(buttons).toHaveLength(2);
    await user.click(buttons[1]!);
    expect(screen.getByTestId('particular-sheet')).toBeInTheDocument();
  });

  it('keeps the compact filtered message and no zero-state while filters are active', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByRole('searchbox'), 'zzz');

    await waitFor(() =>
      expect(screen.queryByText('Todavía no hay particulares')).not.toBeInTheDocument(),
    );
  });
});
