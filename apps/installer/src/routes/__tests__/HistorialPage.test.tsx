import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HistorialPage from '@/routes/HistorialPage';
import type { HistoricalTicket } from '@/hooks/useTicketHistory';

const useTicketHistoryMock = vi.fn();

vi.mock('@/hooks/useTicketHistory', () => ({
  useTicketHistory: () => useTicketHistoryMock(),
}));

function makeHistorical(
  id: string,
  overrides: Partial<HistoricalTicket> = {},
): HistoricalTicket {
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

beforeEach(() => {
  useTicketHistoryMock.mockReset();
});

describe('HistorialPage', () => {
  it('shows the empty state when there is no history', () => {
    useTicketHistoryMock.mockReturnValue({ data: [], isLoading: false, isFetching: false });
    render(<HistorialPage />);
    expect(screen.getByText('Todavía no tenés tareas cerradas.')).toBeInTheDocument();
  });

  it('renders both resolved and cancelled tickets grouped by day', () => {
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
    render(<HistorialPage />);
    // Two day groups
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(2);
    expect(screen.getAllByText('Resuelta')).toHaveLength(2);
    expect(screen.getByText('Cancelada')).toBeInTheDocument();
    expect(screen.getByText('No estaba el equipo')).toBeInTheDocument();
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
    render(<HistorialPage />);

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
    render(<HistorialPage />);

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
    render(<HistorialPage />);

    await user.selectOptions(screen.getByLabelText('Estado'), 'cancelled');
    expect(screen.getByText('No hay tareas con esos filtros.')).toBeInTheDocument();
  });
});
