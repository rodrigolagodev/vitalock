import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '@vitalock/shared';
import type { UseAuthReturn } from '@vitalock/shared';
import DashboardPage from '@/routes/DashboardPage';
import type { AssignedTicket } from '@/hooks/useAssignedTickets';

const useAssignedTicketsMock = vi.fn();

vi.mock('@/hooks/useAssignedTickets', () => ({
  useAssignedTickets: () => useAssignedTicketsMock(),
}));

const authStub: UseAuthReturn = {
  phase: 'authenticated',
  session: { user: { email: 'i@example.com' } } as unknown as UseAuthReturn['session'],
  staff: {
    id: 'staff-1',
    auth_user_id: 'auth-1',
    full_name: 'Juan Perez',
    role: 'installer',
    status: 'active',
  },
  error: null,
  isLoading: false,
  signIn: async () => {},
  signOut: async () => {},
  refresh: async () => {},
};

function makeTicket(id: string, overrides: Partial<AssignedTicket> = {}): AssignedTicket {
  return {
    id,
    title: `Tarea ${id}`,
    description: `Tarea ${id}`,
    status: 'open',
    category: 'maintenance',
    opened_at: '2026-08-20T10:00:00Z',
    building: {
      id: 'b1',
      name: 'Edificio Uno',
      administration: { id: 'a1', company_name: 'Admin A' },
    },
    pending_new_serial: null,
    pending_new_model: null,
    intended_product_name: null,
    ...overrides,
  };
}

function renderDashboard() {
  return render(
    <AuthContext.Provider value={authStub}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

beforeEach(() => {
  useAssignedTicketsMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('DashboardPage', () => {
  it('greets the installer by first name', () => {
    useAssignedTicketsMock.mockReturnValue({ data: [], isLoading: false, isFetching: false });
    renderDashboard();
    expect(screen.getByRole('heading', { name: 'Hola, Juan' })).toBeInTheDocument();
  });

  it('shows total pending tasks in the stat card', () => {
    useAssignedTicketsMock.mockReturnValue({
      data: [makeTicket('1'), makeTicket('2'), makeTicket('3')],
      isLoading: false,
      isFetching: false,
    });
    renderDashboard();
    expect(screen.getByText('Tareas pendientes')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('lists up to 5 quick-access tickets in status/date order', () => {
    const data = [
      makeTicket('a', { status: 'open', opened_at: '2026-08-25T10:00:00Z' }),
      makeTicket('b', { status: 'in_progress', opened_at: '2026-08-24T10:00:00Z' }),
      makeTicket('c', { status: 'open', opened_at: '2026-08-20T10:00:00Z' }),
      makeTicket('d', { status: 'open', opened_at: '2026-08-22T10:00:00Z' }),
      makeTicket('e', { status: 'open', opened_at: '2026-08-23T10:00:00Z' }),
      makeTicket('f', { status: 'open', opened_at: '2026-08-21T10:00:00Z' }),
    ];
    useAssignedTicketsMock.mockReturnValue({ data, isLoading: false, isFetching: false });
    renderDashboard();

    // 5 tickets shown + "+1 tarea más" trailer
    const items = screen.getAllByRole('link', { name: /Tarea/ });
    expect(items).toHaveLength(5);
    expect(items[0]).toHaveTextContent('Tarea b'); // in_progress first
    expect(screen.getByText('+1 tarea más')).toBeInTheDocument();
  });

  it('shows an empty state when there are no pending tasks', () => {
    useAssignedTicketsMock.mockReturnValue({ data: [], isLoading: false, isFetching: false });
    renderDashboard();
    expect(
      screen.getByText('No tenés tareas pendientes. ¡Buen trabajo!'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Ver todas/ })).not.toBeInTheDocument();
  });

  it('provides a "Ver todas" link to /tareas when tasks exist', () => {
    useAssignedTicketsMock.mockReturnValue({
      data: [makeTicket('1')],
      isLoading: false,
      isFetching: false,
    });
    renderDashboard();
    const link = screen.getByRole('link', { name: /Ver todas/ });
    expect(link).toHaveAttribute('href', '/tareas');
  });

  it('shows a loading placeholder while the query is pending', () => {
    useAssignedTicketsMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isFetching: true,
    });
    renderDashboard();
    expect(screen.getByText('Cargando tareas…')).toBeInTheDocument();
    // StatCard still renders with placeholder value.
    const statCard = screen.getByText('Tareas pendientes').closest('div');
    expect(statCard).not.toBeNull();
    expect(within(statCard as HTMLElement).getByText('…')).toBeInTheDocument();
  });
});
