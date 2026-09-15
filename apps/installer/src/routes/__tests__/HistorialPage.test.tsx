import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import HistorialPage from '@/routes/HistorialPage';
import type { HistoricalTicket } from '@/hooks/useTicketHistory';

const useTicketHistoryMock = vi.fn();

vi.mock('@/hooks/useTicketHistory', () => ({
  useTicketHistory: () => useTicketHistoryMock(),
}));

function makeHistorical(id: string, overrides: Partial<HistoricalTicket> = {}): HistoricalTicket {
  return {
    id,
    title: `Tarea ${id}`,
    status: 'resolved',
    category: 'maintain_equipment',
    opened_at: '2026-08-20T10:00:00Z',
    closed_at: '2026-08-25T15:00:00Z',
    resolution_notes: null,
    cancellation_reason: null,
    building: {
      id: 'b1',
      name: 'Edificio Uno',
      administration: { id: 'a1', company_name: 'Admin A' },
    },
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/historial']}>
      <HistorialPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useTicketHistoryMock.mockReset();
});

describe('HistorialPage', () => {
  it('shows a loading skeleton while the query is pending', () => {
    useTicketHistoryMock.mockReturnValue({ data: undefined, isLoading: true, isFetching: true });
    renderPage();
    expect(screen.getByRole('heading', { name: 'Historial' })).toBeInTheDocument();
    expect(screen.getByLabelText('Cargando historial')).toBeInTheDocument();
  });

  it('shows a refresh indicator on background refetch', () => {
    useTicketHistoryMock.mockReturnValue({ data: [], isLoading: false, isFetching: true });
    renderPage();
    expect(screen.getByLabelText('Actualizando')).toBeInTheDocument();
  });

  it('shows the empty state when there is no history', () => {
    useTicketHistoryMock.mockReturnValue({ data: [], isLoading: false, isFetching: false });
    renderPage();
    expect(screen.getByText('Todavía no tenés tareas cerradas.')).toBeInTheDocument();
  });

  it('groups tickets that fall in the same month under a single month heading', () => {
    useTicketHistoryMock.mockReturnValue({
      data: [
        makeHistorical('1', { closed_at: '2026-08-25T15:00:00Z' }),
        makeHistorical('2', {
          status: 'cancelled',
          closed_at: '2026-08-25T09:00:00Z',
          cancellation_reason: 'No estaba el equipo',
        }),
        makeHistorical('3', { closed_at: '2026-08-20T09:00:00Z' }),
      ],
      isLoading: false,
      isFetching: false,
    });
    renderPage();
    // All 3 tickets are in August 2026 — one month heading, not one per card.
    const headings = screen.getAllByRole('heading', { level: 2 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent(/agosto/i);
    expect(screen.getAllByText('Resuelta')).toHaveLength(2);
    expect(screen.getByText('Cancelada')).toBeInTheDocument();
    expect(screen.getByText('No estaba el equipo')).toBeInTheDocument();
  });

  it('splits tickets across months into separate headings, most recent month first', () => {
    useTicketHistoryMock.mockReturnValue({
      data: [
        makeHistorical('1', { title: 'Tarea Julio', closed_at: '2026-07-15T09:00:00Z' }),
        makeHistorical('2', { title: 'Tarea Agosto', closed_at: '2026-08-05T09:00:00Z' }),
      ],
      isLoading: false,
      isFetching: false,
    });
    renderPage();
    const headings = screen.getAllByRole('heading', { level: 2 });
    expect(headings).toHaveLength(2);
    expect(headings[0]).toHaveTextContent(/agosto/i);
    expect(headings[1]).toHaveTextContent(/julio/i);
  });

  it("shows each ticket's own close date on its card, in the order the hook returns them", () => {
    useTicketHistoryMock.mockReturnValue({
      data: [
        makeHistorical('1', { category: 'install_equipment', closed_at: '2026-08-20T09:00:00Z' }),
        makeHistorical('2', { category: 'replace_equipment', closed_at: '2026-08-25T15:00:00Z' }),
        makeHistorical('3', { category: 'update_equipment', closed_at: '2026-08-22T12:00:00Z' }),
      ],
      isLoading: false,
      isFetching: false,
    });
    renderPage();
    // No client-side re-sort within a month: the hook already orders by
    // updated_at desc, so the group preserves whatever order data arrives in.
    // The card title is the category label, not the raw ticket title.
    const titles = screen
      .getAllByText(/^(Instalación de equipo|Reemplazo de equipo|Actualización de equipo)$/)
      .map((el) => el.textContent);
    expect(titles).toEqual([
      'Instalación de equipo',
      'Reemplazo de equipo',
      'Actualización de equipo',
    ]);
    // Each card shows a "dd/mm/yyyy · hh:mm"-shaped date, not just a time.
    const dateTexts = screen.getAllByText(/^\d{2}\/\d{2}\/\d{4} · \d{2}:\d{2}$/);
    expect(dateTexts).toHaveLength(3);
  });

  it('renders a decorative category icon on each card, and the title as the category label rather than the raw ticket title', () => {
    useTicketHistoryMock.mockReturnValue({
      data: [
        makeHistorical('1', { title: 'texto libre inconsistente', category: 'maintain_equipment' }),
      ],
      isLoading: false,
      isFetching: false,
    });
    renderPage();
    expect(screen.getByText('Mantenimiento')).toBeInTheDocument();
    expect(screen.queryByText('texto libre inconsistente')).not.toBeInTheDocument();
    const list = screen.getByRole('list');
    expect(list.querySelector('svg[aria-hidden="true"]')).toBeInTheDocument();
  });

  it('keeps the native <select> filter markup untouched by the card refactor', () => {
    useTicketHistoryMock.mockReturnValue({
      data: [makeHistorical('1')],
      isLoading: false,
      isFetching: false,
    });
    renderPage();
    const statusSelect = screen.getByLabelText('Estado');
    const buildingSelect = screen.getByLabelText('Edificio');
    expect(statusSelect.tagName).toBe('SELECT');
    expect(buildingSelect.tagName).toBe('SELECT');
    expect(statusSelect).toHaveClass(
      'flex h-11 w-full min-w-40 appearance-none rounded-lg border border-input bg-card py-2 pl-3 pr-8 text-base text-foreground',
    );
  });

  it('links each row title to the task detail, showing the category label — not the raw ticket title', () => {
    useTicketHistoryMock.mockReturnValue({
      data: [
        makeHistorical('abc-123', { title: 'Mantenimiento Torre', category: 'maintain_equipment' }),
      ],
      isLoading: false,
      isFetching: false,
    });
    renderPage();
    expect(screen.getByRole('link', { name: 'Mantenimiento' })).toHaveAttribute(
      'href',
      '/tareas/abc-123',
    );
  });

  it('filters by status', async () => {
    useTicketHistoryMock.mockReturnValue({
      data: [
        makeHistorical('1'),
        makeHistorical('2', { status: 'cancelled', cancellation_reason: 'x' }),
      ],
      isLoading: false,
      isFetching: false,
    });
    const user = userEvent.setup();
    renderPage();

    await user.selectOptions(screen.getByLabelText('Estado'), 'cancelled');
    expect(screen.queryByText('Resuelta')).not.toBeInTheDocument();
    expect(screen.getByText('Cancelada')).toBeInTheDocument();
  });

  it('filters by building', async () => {
    useTicketHistoryMock.mockReturnValue({
      data: [
        makeHistorical('1', {
          building: {
            id: 'b1',
            name: 'Edificio Uno',
            administration: { id: 'a1', company_name: 'A' },
          },
        }),
        makeHistorical('2', {
          building: {
            id: 'b2',
            name: 'Edificio Dos',
            administration: { id: 'a2', company_name: 'B' },
          },
        }),
      ],
      isLoading: false,
      isFetching: false,
    });
    const user = userEvent.setup();
    renderPage();

    await user.selectOptions(screen.getByLabelText('Edificio'), 'b2');
    // Scope the assertions to the ticket list, not the <option> values.
    const list = screen.getByRole('list');
    const items = list.querySelectorAll('li');
    expect(items).toHaveLength(1);
    expect(items[0]?.textContent).toContain('Edificio Dos');
    expect(items[0]?.textContent).not.toContain('Edificio Uno');
  });

  it('shows a friendly "no matches" message when filters exclude everything', async () => {
    useTicketHistoryMock.mockReturnValue({
      data: [makeHistorical('1')],
      isLoading: false,
      isFetching: false,
    });
    const user = userEvent.setup();
    renderPage();

    await user.selectOptions(screen.getByLabelText('Estado'), 'cancelled');
    expect(screen.getByText('No hay tareas con esos filtros.')).toBeInTheDocument();
  });
});
