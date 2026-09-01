import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TareasPage from '@/routes/TareasPage';
import type { AssignedTicket } from '@/hooks/useAssignedTickets';

const useAssignedTicketsMock = vi.fn();

vi.mock('@/hooks/useAssignedTickets', () => ({
  useAssignedTickets: () => useAssignedTicketsMock(),
}));

function makeTicket(id: string, overrides: Partial<AssignedTicket> = {}): AssignedTicket {
  return {
    id,
    title: `Tarea ${id}`,
    description: `Tarea ${id}`,
    status: 'open',
    category: 'update_equipment',
    opened_at: '2026-08-20T10:00:00Z',
    building: {
      id: 'b1',
      name: 'Edificio Uno',
      address: null,
      city: null,
      administration: { id: 'a1', company_name: 'Admin A' },
    },
    equipmentUpdateSnapshot: {
      task_id: `task-${id}`,
      equipment_id: 'eq-1',
      mdb_storage_path: `tickets/${id}/db.mdb`,
      keys_to_activate: ['k1', 'k2'],
      keys_to_disable: ['k3'],
    },
    pending_new_serial: null,
    pending_new_model: null,
    intended_product_name: null,
    ...overrides,
  };
}

function renderTareas() {
  return render(
    <MemoryRouter>
      <TareasPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useAssignedTicketsMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('TareasPage', () => {
  it('shows the empty state when there are no tasks', () => {
    useAssignedTicketsMock.mockReturnValue({ data: [], isLoading: false, isFetching: false });
    renderTareas();
    expect(
      screen.getByText('Estás al día. No tenés tareas pendientes.'),
    ).toBeInTheDocument();
  });

  it('renders one row per task as a link to the individual detail route', () => {
    useAssignedTicketsMock.mockReturnValue({
      data: [makeTicket('1'), makeTicket('2')],
      isLoading: false,
      isFetching: false,
    });
    renderTareas();

    const links = screen.getAllByRole('link', { name: /Tarea/ });
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute('href', '/tareas/1');
    expect(links[1]).toHaveAttribute('href', '/tareas/2');
  });

  it('orders in-progress tasks before open ones', () => {
    useAssignedTicketsMock.mockReturnValue({
      data: [
        makeTicket('a', { status: 'open' }),
        makeTicket('b', { status: 'in_progress' }),
        makeTicket('c', { status: 'open' }),
      ],
      isLoading: false,
      isFetching: false,
    });
    renderTareas();

    const links = screen.getAllByRole('link', { name: /Tarea/ });
    expect(links[0]).toHaveTextContent('Tarea b'); // in_progress first
  });

  it('shows a per-task key summary (activate / disable counts)', () => {
    useAssignedTicketsMock.mockReturnValue({
      data: [makeTicket('1')],
      isLoading: false,
      isFetching: false,
    });
    renderTareas();

    expect(screen.getByText('2 alta / 1 baja')).toBeInTheDocument();
  });

  it('shows the building name as task metadata', () => {
    useAssignedTicketsMock.mockReturnValue({
      data: [makeTicket('1')],
      isLoading: false,
      isFetching: false,
    });
    renderTareas();

    expect(screen.getByText('Edificio Uno')).toBeInTheDocument();
  });

  it('shows a loading skeleton while the query is pending', () => {
    useAssignedTicketsMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isFetching: true,
    });
    renderTareas();
    expect(screen.getByRole('heading', { name: 'Mis tareas' })).toBeInTheDocument();
  });
});
