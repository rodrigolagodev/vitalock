import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { usePersonalMock } = vi.hoisted(() => ({
  usePersonalMock: vi.fn(),
}));

vi.mock('@/hooks/usePersonal', () => ({
  usePersonal: usePersonalMock,
}));

import PersonalPage from '../PersonalPage';

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PersonalPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  usePersonalMock.mockReturnValue({ data: [], isFetching: false, isError: false });
});

describe('PersonalPage rendering', () => {
  it('renders the page heading', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: /^personal$/i })).toBeInTheDocument();
  });

  it('renders the "Nuevo integrante" button', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /nuevo integrante/i })).toBeInTheDocument();
  });

  it('renders the search input', () => {
    renderPage();
    expect(screen.getByPlaceholderText(/buscar por nombre, email o id/i)).toBeInTheDocument();
  });

  it('shows error message when isError is true', () => {
    usePersonalMock.mockReturnValueOnce({ data: [], isFetching: false, isError: true });
    renderPage();
    expect(screen.getByText(/error al cargar/i)).toBeInTheDocument();
  });
});

describe('PersonalPage role filter (FilterBar.Select, 2 real values)', () => {
  it('passes the selected role to usePersonal', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('combobox', { name: /^rol$/i }));
    await user.click(screen.getByRole('option', { name: /^instalador$/i }));

    const lastCall = usePersonalMock.mock.calls.at(-1)?.[0];
    expect(lastCall?.role).toBe('installer');
  });
});

describe('PersonalPage FilterBar.Summary', () => {
  it('shows no "Limpiar todo" button when no filters are active', () => {
    renderPage();
    expect(screen.queryByRole('button', { name: /limpiar todo/i })).not.toBeInTheDocument();
  });

  // Multi-facet "Limpiar todo" regression test (required by this batch): this
  // page holds filter state in plain useState (search/role), NOT
  // useSearchParams, so it should NOT hit the Batch 12 react-router-dom
  // setSearchParams non-composition bug.
  it('clears every active facet (search, role) when "Limpiar todo" is clicked once', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByPlaceholderText(/buscar por nombre, email o id/i), 'Juan');
    await waitFor(() => {
      expect(usePersonalMock.mock.calls.at(-1)?.[0]?.search).toBe('Juan');
    });

    await user.click(screen.getByRole('combobox', { name: /^rol$/i }));
    await user.click(screen.getByRole('option', { name: /^instalador$/i }));

    const clearAll = screen.getByRole('button', { name: /limpiar todo/i });
    await user.click(clearAll);

    const lastCall = usePersonalMock.mock.calls.at(-1)?.[0];
    expect(lastCall?.search).toBe('');
    expect(lastCall?.role).toBeUndefined();
    expect(screen.queryByRole('button', { name: /limpiar todo/i })).not.toBeInTheDocument();
  });
});
