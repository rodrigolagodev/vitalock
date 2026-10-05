import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    username: 'juan.perez',
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
    category: 'maintain_equipment',
    opened_at: '2026-08-20T10:00:00Z',
    building: {
      id: 'b1',
      name: 'Edificio Uno',
      address: null,
      city: null,
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
    expect(screen.getByText('No tenés tareas pendientes. ¡Buen trabajo!')).toBeInTheDocument();
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
    // Touch target: default control height (44px), not the 36px `sm` density.
    expect(link).toHaveClass('h-control-md');
    expect(link).not.toHaveClass('h-control-sm');
  });

  it('shows a refresh indicator on background refetch', () => {
    useAssignedTicketsMock.mockReturnValue({ data: [], isLoading: false, isFetching: true });
    renderDashboard();
    expect(screen.getByLabelText('Actualizando')).toBeInTheDocument();
  });

  it('renders its greeting as a large title', () => {
    useAssignedTicketsMock.mockReturnValue({ data: [], isLoading: false, isFetching: false });
    renderDashboard();
    expect(screen.getByRole('heading', { level: 1, name: 'Hola, Juan' })).toHaveClass(
      'text-large-title',
    );
  });

  it('renders a busy skeleton instead of "Cargando…" text on initial load', () => {
    useAssignedTicketsMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isFetching: true,
      isError: false,
    });
    const { container } = renderDashboard();
    const region = container.querySelector('[aria-busy="true"]');
    expect(region).not.toBeNull();
    const blocks = (region as HTMLElement).querySelectorAll('.animate-pulse');
    expect(blocks.length).toBeGreaterThanOrEqual(3);
    expect(blocks.length).toBeLessThanOrEqual(5);
    expect(screen.queryByText('Cargando tareas…')).not.toBeInTheDocument();
  });

  it('shows the ErrorState with a retry that calls refetch once', async () => {
    const refetch = vi.fn();
    useAssignedTicketsMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: false,
      isError: true,
      refetch,
    });
    renderDashboard();
    expect(screen.queryByText(/Estás al día|No tenés tareas pendientes/)).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('keeps stale data on screen when a background refetch fails', () => {
    useAssignedTicketsMock.mockReturnValue({
      data: [makeTicket('t1', { title: 'Tarea vieja' })],
      isLoading: false,
      isFetching: false,
      isError: true,
      refetch: vi.fn(),
    });
    renderDashboard();
    expect(screen.getByText('Tarea vieja')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
  });
});
