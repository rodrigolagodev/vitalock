import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { TareaDetailRow } from '@/hooks/useTarea';

// Hoist mocks for vi.mock hoisting requirement
const { useTareaMock, useTicketCommentsMock } = vi.hoisted(() => ({
  useTareaMock: vi.fn(),
  useTicketCommentsMock: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/hooks/useTarea', () => ({ useTarea: useTareaMock }));
vi.mock('@/hooks/useTicketComments', () => ({ useTicketComments: useTicketCommentsMock }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
// Stub heavy sub-components to avoid deep dependency chains
vi.mock('@/components/tareas/TareaFormSheet', () => ({
  TareaFormSheet: () => null,
}));
vi.mock('@/components/tareas/AssignEquipmentDialog', () => ({
  AssignEquipmentDialog: () => null,
}));
vi.mock('@/components/tareas/ConfigureEquipmentPanel', () => ({
  ConfigureEquipmentPanel: () => null,
}));

import TareaDetailPage from '../TareaDetailPage';

function makeTarea(overrides: Partial<TareaDetailRow> = {}): TareaDetailRow {
  return {
    id: 'ticket-1',
    ticket_number: 'TKT-000001',
    category: 'maintain_equipment',
    description: 'Fix the lock',
    status: 'open',
    building_id: 'bld-1',
    building: { id: 'bld-1', name: 'Torre Norte', administration: null },
    equipment_id: null,
    equipment: null,
    assigned_to_staff_id: null,
    assigned_to_name: null,
    opened_by_staff_id: null,
    opened_by_name: null,
    opened_at: '2026-09-01T10:00:00Z',
    updated_at: '2026-09-01T10:00:00Z',
    resolved_at: null,
    resolved_by_staff_id: null,
    resolved_by_name: null,
    resolution_notes: null,
    cancellation_reason: null,
    notes: null,
    pending_new_serial: null,
    pending_new_model: null,
    technical_order_item_id: null,
    intended_product_name: null,
    ...overrides,
  };
}

function renderPage(tareaId = 'ticket-1') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <MemoryRouter initialEntries={[`/tareas/${tareaId}`]}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/tareas/:tareaId" element={<TareaDetailPage />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useTareaMock.mockReturnValue({
    data: makeTarea(),
    isLoading: false,
    isError: false,
  });
  useTicketCommentsMock.mockReturnValue({ data: [], isLoading: false });
});

// ─────────────────────────────────────────────────────────────────────────────
// Terminal status guard — isTerminalTicket
// ─────────────────────────────────────────────────────────────────────────────

describe('TareaDetailPage — Editar button terminal guard', () => {
  it('shows Editar button when status is open (non-terminal)', () => {
    useTareaMock.mockReturnValue({
      data: makeTarea({ status: 'open' }),
      isLoading: false,
      isError: false,
    });
    renderPage();
    expect(screen.getByRole('button', { name: /editar/i })).toBeInTheDocument();
  });

  it('shows Editar button when status is in_progress (non-terminal)', () => {
    useTareaMock.mockReturnValue({
      data: makeTarea({ status: 'in_progress' }),
      isLoading: false,
      isError: false,
    });
    renderPage();
    expect(screen.getByRole('button', { name: /editar/i })).toBeInTheDocument();
  });

  it('hides Editar button when status is resolved (terminal)', () => {
    useTareaMock.mockReturnValue({
      data: makeTarea({ status: 'resolved' }),
      isLoading: false,
      isError: false,
    });
    renderPage();
    expect(screen.queryByRole('button', { name: /editar/i })).not.toBeInTheDocument();
  });

  it('hides Editar button when status is cancelled (terminal)', () => {
    useTareaMock.mockReturnValue({
      data: makeTarea({ status: 'cancelled' }),
      isLoading: false,
      isError: false,
    });
    renderPage();
    expect(screen.queryByRole('button', { name: /editar/i })).not.toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Basic rendering
// ─────────────────────────────────────────────────────────────────────────────

describe('TareaDetailPage — basic rendering', () => {
  it('renders ticket_number as heading', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: /TKT-000001/i })).toBeInTheDocument();
  });

  it('shows loading skeleton', () => {
    useTareaMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });
    const { container } = renderPage();
    expect(container.querySelector('.animate-pulse')).not.toBeNull();
  });

  it('shows error message', () => {
    useTareaMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });
    renderPage();
    expect(screen.getByText(/error al cargar la tarea/i)).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Traceability — resolution rows + Trazabilidad card
// ─────────────────────────────────────────────────────────────────────────────

describe('TareaDetailPage — traceability', () => {
  it('shows "Finalizada por" / "Finalizada el" and the timeline for a resolved ticket', () => {
    useTareaMock.mockReturnValue({
      data: makeTarea({
        status: 'resolved',
        opened_by_name: 'Ana Gómez',
        assigned_to_name: 'Pablo Ruiz',
        resolved_at: '2026-09-03T16:45:00Z',
        resolved_by_staff_id: 's-2',
        resolved_by_name: 'Pablo Ruiz',
        resolution_notes: 'Cilindro reemplazado.',
      }),
      isLoading: false,
      isError: false,
    });
    renderPage();

    expect(screen.getByText('Finalizada por')).toBeInTheDocument();
    expect(screen.getByText('Finalizada el')).toBeInTheDocument();
    expect(screen.queryByText('Cancelada el')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Trazabilidad' })).toBeInTheDocument();

    const timeline = screen.getByRole('list', { name: 'Línea de tiempo' });
    const steps = within(timeline).getAllByRole('listitem');
    expect(steps).toHaveLength(3);
    expect(steps[0]).toHaveTextContent('Abierta');
    expect(steps[0]).toHaveTextContent('Ana Gómez');
    expect(steps[1]).toHaveTextContent('Asignada a');
    expect(steps[2]).toHaveTextContent('Finalizada');
    expect(steps[2]).toHaveTextContent('Cilindro reemplazado.');
  });

  it('shows "Cancelada el" (from updated_at) for a cancelled ticket', () => {
    useTareaMock.mockReturnValue({
      data: makeTarea({
        status: 'cancelled',
        updated_at: '2026-09-04T09:00:00Z',
        cancellation_reason: 'Duplicada.',
      }),
      isLoading: false,
      isError: false,
    });
    renderPage();

    expect(screen.getByText('Cancelada el')).toBeInTheDocument();
    expect(screen.queryByText('Finalizada el')).not.toBeInTheDocument();
    expect(screen.queryByText('Finalizada por')).not.toBeInTheDocument();
    const timeline = screen.getByRole('list', { name: 'Línea de tiempo' });
    expect(within(timeline).getAllByRole('listitem').at(-1)).toHaveTextContent('Cancelada');
  });

  it('hides the resolution rows while the ticket is active and lists comments', () => {
    useTicketCommentsMock.mockReturnValue({
      data: [
        {
          id: 'c-1',
          ticket_id: 'ticket-1',
          body: 'Llegué al edificio.',
          created_at: '2026-09-02T12:00:00Z',
          author_staff_id: 's-2',
          author_full_name: 'Pablo Ruiz',
        },
      ],
      isLoading: false,
    });
    renderPage();

    expect(screen.queryByText('Finalizada el')).not.toBeInTheDocument();
    expect(screen.queryByText('Cancelada el')).not.toBeInTheDocument();
    expect(screen.getByText('Llegué al edificio.')).toBeInTheDocument();
    expect(useTicketCommentsMock).toHaveBeenCalledWith('ticket-1');
  });
});
