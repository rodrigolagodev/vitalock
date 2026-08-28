import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  mockCreateSignedUrl,
  mockStorageFrom,
  mockSupportSchema,
  mockPriorUpdatesOrder,
  mockResolveEquipmentUpdateRpc,
  mockUseResolveEquipmentUpdate,
  mockToastSuccess,
  mockToastWarning,
  mockUseAssignedTickets,
  mockUseRfidKeyCodeMap,
  mockUseTicketComments,
} = vi.hoisted(() => {
  const mockCreateSignedUrl = vi.fn();
  const mockStorageFrom = vi.fn(() => ({ createSignedUrl: mockCreateSignedUrl }));

  const mockPriorUpdatesOrder = vi.fn(() => Promise.resolve({ data: [], error: null }));
  const mockPriorUpdatesNot = vi.fn(() => ({ order: mockPriorUpdatesOrder }));
  const mockPriorUpdatesEq = vi.fn(() => ({ not: mockPriorUpdatesNot }));
  const mockPriorUpdatesSelect = vi.fn(() => ({ eq: mockPriorUpdatesEq }));
  const mockSupportFrom = vi.fn(() => ({ select: mockPriorUpdatesSelect }));
  const mockSupportSchema = vi.fn(() => ({ from: mockSupportFrom }));

  return {
    mockCreateSignedUrl,
    mockStorageFrom,
    mockSupportSchema,
    mockPriorUpdatesOrder,
    mockResolveEquipmentUpdateRpc: vi.fn(),
    mockUseResolveEquipmentUpdate: vi.fn(() => ({
      mutate: vi.fn(),
      isPending: false,
    })),
    mockToastSuccess: vi.fn(),
    mockToastWarning: vi.fn(),
    mockUseAssignedTickets: vi.fn<(ids?: never) => { data: unknown[]; isLoading: boolean; isFetching: boolean }>(() => ({
      data: [],
      isLoading: false,
      isFetching: false,
    })),
    mockUseRfidKeyCodeMap: vi.fn<(ids: string[]) => Map<string, string>>(() => new Map()),
    mockUseTicketComments: vi.fn<(id: string) => { data: unknown[] }>(() => ({ data: [] })),
  };
});

vi.mock('@/lib/supabase', () => ({
  supabase: {
    schema: mockSupportSchema,
    storage: { from: mockStorageFrom },
    from: vi.fn(),
  },
}));

vi.mock('@vitalock/supabase', () => ({
  resolveEquipmentUpdate: mockResolveEquipmentUpdateRpc,
}));

vi.mock('@vitalock/shared', () => ({
  useAuthContext: () => ({
    staff: { id: 'installer-001', full_name: 'Pablo', role: 'installer', status: 'active' },
  }),
  logger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('sonner', () => ({
  toast: { success: mockToastSuccess, warning: mockToastWarning, error: vi.fn() },
}));

vi.mock('@/hooks/useAssignedTickets', () => ({
  useAssignedTickets: () => mockUseAssignedTickets(),
}));

vi.mock('@/hooks/useResolveEquipmentUpdate', () => ({
  useResolveEquipmentUpdate: () => mockUseResolveEquipmentUpdate(),
}));

vi.mock('@/hooks/useRfidKeyCodeMap', () => ({
  useRfidKeyCodeMap: (ids: string[]) => mockUseRfidKeyCodeMap(ids),
}));

vi.mock('@/hooks/useTicketComments', () => ({
  useTicketComments: (id: string) => mockUseTicketComments(id),
}));

// ---------------------------------------------------------------------------
// Import under test (after mocks)
// ---------------------------------------------------------------------------

import TaskDetailPage from '@/routes/TaskDetailPage';
import type { AssignedTicket } from '@/hooks/useAssignedTickets';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTicket(overrides: Partial<AssignedTicket> = {}): AssignedTicket {
  return {
    id: 'ticket-001',
    title: 'Actualización SN-001',
    description: 'Actualización SN-001',
    status: 'open',
    category: 'equipment_update',
    opened_at: '2026-08-17T00:00:00Z',
    building: {
      id: 'bld-001',
      name: 'Edificio Test',
      administration: { id: 'adm-001', company_name: 'Admin Test' },
    },
    equipmentUpdateSnapshot: {
      task_id: 'task-001',
      equipment_id: 'equip-001',
      mdb_storage_path: 'task-001/equip.mdb',
      keys_to_activate: ['key-uuid-activate-001'],
      keys_to_disable: ['key-uuid-disable-001'],
    },
    pending_new_serial: null,
    pending_new_model: null,
    intended_product_name: null,
    ...overrides,
  };
}

function renderDetail() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  }
  return render(
    <Wrapper>
      <MemoryRouter initialEntries={['/tareas/ticket-001']}>
        <Routes>
          <Route path="tareas/:id" element={<TaskDetailPage />} />
        </Routes>
      </MemoryRouter>
    </Wrapper>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAssignedTickets.mockReturnValue({
    data: [makeTicket()],
    isLoading: false,
    isFetching: false,
  });
  mockUseRfidKeyCodeMap.mockReturnValue(new Map([['key-uuid-activate-001', 'RFID-ACT-001']]));
  mockUseTicketComments.mockReturnValue({ data: [] });
  mockPriorUpdatesOrder.mockResolvedValue({ data: [], error: null });
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TaskDetailPage', () => {
  it('shows the task header with status and building metadata', () => {
    renderDetail();
    expect(screen.getByRole('heading', { name: 'Actualización SN-001' })).toBeInTheDocument();
    expect(screen.getByText('Pendiente')).toBeInTheDocument();
    expect(screen.getByText(/Edificio Test/)).toBeInTheDocument();
  });

  it('renders keys to activate with decoded rfid codes', async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText('RFID-ACT-001')).toBeInTheDocument();
    });
  });

  it('renders the .mdb download button and calls createSignedUrl on click', async () => {
    const user = userEvent.setup();
    mockCreateSignedUrl.mockResolvedValueOnce({ data: { signedUrl: 'https://x/signed' }, error: null });
    renderDetail();

    const btn = screen.getByRole('button', { name: /descargar archivo/i });
    await user.click(btn);

    expect(mockStorageFrom).toHaveBeenCalledWith('equipment-updates-mdb');
    expect(mockCreateSignedUrl).toHaveBeenCalledWith('task-001/equip.mdb', 300);
  });

  it('shows the comment history section and add-comment form', () => {
    mockUseTicketComments.mockReturnValue({
      data: [
        {
          id: 'c1',
          ticket_id: 'ticket-001',
          body: 'Primer comentario',
          created_at: '2026-08-17T01:00:00Z',
          author_staff_id: 's1',
          author_full_name: 'Pablo',
        },
      ],
    });
    renderDetail();
    expect(screen.getByText('Primer comentario')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Escribí un comentario…')).toBeInTheDocument();
  });

  it('provides a back link to /tareas', async () => {
    renderDetail();
    await waitFor(() => {
      const back = screen.getByRole('link', { name: /mis tareas/i });
      expect(back).toHaveAttribute('href', '/tareas');
    });
  });

  it('calls resolve mutation when Resolver is clicked', async () => {
    const user = userEvent.setup();
    const mutate = vi.fn();
    mockUseResolveEquipmentUpdate.mockReturnValue({ mutate, isPending: false });
    renderDetail();

    await user.click(screen.getByRole('button', { name: 'Resolver tarea' }));
    expect(mutate).toHaveBeenCalledWith({
      taskId: 'task-001',
      ticketId: 'ticket-001',
    });
  });

  it('shows a not-found message when the task is missing', () => {
    mockUseAssignedTickets.mockReturnValue({ data: [], isLoading: false, isFetching: false });
    renderDetail();
    expect(screen.getByText(/No se encontró la tarea/)).toBeInTheDocument();
  });
});
