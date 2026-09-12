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
  mockUseResolveTickets,
  mockToastSuccess,
  mockToastWarning,
  mockUseTicket,
  mockUseRfidKeyCodeMap,
  mockUseTicketComments,
  mockUseEquipmentById,
  mockUseMaintenanceHistory,
  mockUseEquipmentUpdateHistory,
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
    mockUseResolveTickets: vi.fn(() => ({
      mutate: vi.fn(),
      isPending: false,
    })),
    mockToastSuccess: vi.fn(),
    mockToastWarning: vi.fn(),
    mockUseTicket: vi.fn<(id?: string) => { data: unknown; isLoading: boolean; isError: boolean }>(
      () => ({
        data: null,
        isLoading: false,
        isError: false,
      }),
    ),
    mockUseRfidKeyCodeMap: vi.fn<(ids: string[]) => Map<string, string>>(() => new Map()),
    mockUseTicketComments: vi.fn<(id: string) => { data: unknown[] }>(() => ({ data: [] })),
    mockUseEquipmentById: vi.fn<() => { data: unknown; isLoading: boolean; isFetching: boolean }>(
      () => ({ data: null, isLoading: false, isFetching: false }),
    ),
    mockUseMaintenanceHistory: vi.fn<
      () => { data: unknown[]; isLoading: boolean; isFetching: boolean }
    >(() => ({ data: [], isLoading: false, isFetching: false })),
    mockUseEquipmentUpdateHistory: vi.fn<
      () => { data: unknown[]; isLoading: boolean; isFetching: boolean }
    >(() => ({ data: [], isLoading: false, isFetching: false })),
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

// Partial mock: keep the real hooks (useMdbDownload etc.) and override only auth/logger.
vi.mock('@vitalock/shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@vitalock/shared')>()),
  useAuthContext: () => ({
    staff: { id: 'installer-001', full_name: 'Pablo', role: 'installer', status: 'active' },
  }),
  logger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('sonner', () => ({
  toast: { success: mockToastSuccess, warning: mockToastWarning, error: vi.fn() },
}));

vi.mock('@/hooks/useTicket', () => ({
  useTicket: (id?: string) => mockUseTicket(id),
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

vi.mock('@/hooks/useResolveTickets', () => ({
  useResolveTickets: () => mockUseResolveTickets(),
}));

vi.mock('@/hooks/useEquipmentDetail', () => ({
  useEquipmentById: () => mockUseEquipmentById(),
  useMaintenanceHistory: () => mockUseMaintenanceHistory(),
  useEquipmentUpdateHistory: () => mockUseEquipmentUpdateHistory(),
}));

vi.mock('@/components/work/ConfigureEquipmentInline', () => ({
  ConfigureEquipmentInline: () => <div data-testid="configure-equipment-inline" />,
}));

// ---------------------------------------------------------------------------
// Import under test (after mocks)
// ---------------------------------------------------------------------------

import TaskDetailPage from '@/routes/TaskDetailPage';
import type { TicketDetail } from '@/hooks/useAssignedTickets';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTicket(overrides: Partial<TicketDetail> = {}): TicketDetail {
  return {
    id: 'ticket-001',
    title: 'Actualización SN-001',
    description: 'Actualización SN-001',
    status: 'open',
    category: 'update_equipment',
    opened_at: '2026-08-17T00:00:00Z',
    updated_at: '2026-08-17T00:00:00Z',
    resolved_at: null,
    resolved_by_staff_id: null,
    resolution_notes: null,
    cancellation_reason: null,
    building: {
      id: 'bld-001',
      name: 'Edificio Test',
      address: null,
      city: null,
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

function mockTicket(ticket: TicketDetail | null) {
  mockUseTicket.mockReturnValue({ data: ticket, isLoading: false, isError: false });
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
  mockTicket(makeTicket());
  mockUseRfidKeyCodeMap.mockReturnValue(new Map([['key-uuid-activate-001', 'RFID-ACT-001']]));
  mockUseTicketComments.mockReturnValue({ data: [] });
  mockPriorUpdatesOrder.mockResolvedValue({ data: [], error: null });
  mockUseResolveTickets.mockReturnValue({ mutate: vi.fn(), isPending: false });
  mockUseEquipmentById.mockReturnValue({ data: null, isLoading: false, isFetching: false });
  mockUseMaintenanceHistory.mockReturnValue({ data: [], isLoading: false, isFetching: false });
  mockUseEquipmentUpdateHistory.mockReturnValue({ data: [], isLoading: false, isFetching: false });
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
    mockCreateSignedUrl.mockResolvedValueOnce({
      data: { signedUrl: 'https://x/signed' },
      error: null,
    });
    renderDetail();

    const btn = screen.getByRole('button', { name: /descargar archivo/i });
    await user.click(btn);

    expect(mockStorageFrom).toHaveBeenCalledWith('equipment-updates-mdb');
    expect(mockCreateSignedUrl).toHaveBeenCalledWith('task-001/equip.mdb', 300);
  });

  it('lists prior updates with a download per record', async () => {
    const user = userEvent.setup();
    mockCreateSignedUrl.mockResolvedValueOnce({
      data: { signedUrl: 'https://x/signed-prior' },
      error: null,
    });
    mockUseEquipmentUpdateHistory.mockReturnValue({
      data: [
        {
          id: 'upd-prev',
          mdb_storage_path: 'task-000/equip.mdb',
          created_at: '2026-08-01T10:00:00Z',
        },
      ],
      isLoading: false,
      isFetching: false,
    });
    renderDetail();

    expect(screen.getByText('Actualizaciones anteriores (1)')).toBeInTheDocument();
    expect(screen.getByText(/desincronizará la base de datos/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Descargar' }));
    expect(mockCreateSignedUrl).toHaveBeenCalledWith('task-000/equip.mdb', 300);
  });

  it('shows a loading skeleton while the ticket is pending', () => {
    mockUseTicket.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    renderDetail();
    expect(screen.getByLabelText('Cargando')).toBeInTheDocument();
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
    mockTicket(null);
    renderDetail();
    expect(
      screen.getByText('No se encontró la tarea. Puede que no tengas acceso a ella.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver a mis tareas' })).toHaveAttribute(
      'href',
      '/tareas',
    );
  });

  it('shows an error state when the ticket query fails', () => {
    mockUseTicket.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    renderDetail();
    expect(screen.getByText('Error al cargar la tarea.')).toBeInTheDocument();
  });

  describe('closed tickets (read-only)', () => {
    it('renders the resolution card and hides every action for a resolved ticket', () => {
      mockTicket(
        makeTicket({
          status: 'resolved',
          resolved_at: '2026-08-20T14:30:00Z',
          resolution_notes: 'Actualización aplicada sin novedades.',
        }),
      );
      mockUseTicketComments.mockReturnValue({
        data: [
          {
            id: 'c1',
            ticket_id: 'ticket-001',
            body: 'Comentario previo',
            created_at: '2026-08-17T01:00:00Z',
            author_staff_id: 's1',
            author_full_name: 'Pablo',
          },
        ],
      });
      renderDetail();

      expect(screen.getByText('Resuelta')).toBeInTheDocument();
      expect(screen.getByRole('region', { name: 'Resolución' })).toBeInTheDocument();
      expect(screen.getByText('Resuelta el')).toBeInTheDocument();
      expect(screen.getByText('Actualización aplicada sin novedades.')).toBeInTheDocument();

      expect(screen.queryByRole('button', { name: 'Resolver tarea' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Finalizar tarea' })).not.toBeInTheDocument();
      expect(screen.queryByPlaceholderText('Escribí un comentario…')).not.toBeInTheDocument();
      // Comments stay readable; the .mdb download remains available.
      expect(screen.getByText('Comentario previo')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /descargar archivo/i })).toBeInTheDocument();
    });

    it('renders the cancellation card with the reason for a cancelled ticket', () => {
      mockTicket(
        makeTicket({
          status: 'cancelled',
          category: 'maintain_equipment',
          updated_at: '2026-08-21T09:00:00Z',
          cancellation_reason: 'El edificio dio de baja el servicio.',
        }),
      );
      renderDetail();

      expect(screen.getByText('Cancelada')).toBeInTheDocument();
      expect(screen.getByRole('region', { name: 'Cancelación' })).toBeInTheDocument();
      expect(screen.getByText('Cancelada el')).toBeInTheDocument();
      expect(screen.getByText('Motivo de cancelación')).toBeInTheDocument();
      expect(screen.getByText('El edificio dio de baja el servicio.')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Finalizar tarea' })).not.toBeInTheDocument();
      expect(screen.queryByRole('region', { name: 'Resolución' })).not.toBeInTheDocument();
    });

    it('points the breadcrumb back to /historial when the ticket is closed', () => {
      mockTicket(makeTicket({ status: 'resolved', resolved_at: '2026-08-20T14:30:00Z' }));
      renderDetail();
      expect(screen.getByRole('link', { name: 'Historial' })).toHaveAttribute('href', '/historial');
      expect(screen.queryByRole('link', { name: /mis tareas/i })).not.toBeInTheDocument();
    });

    it('shows the configured equipment read-only instead of the configure form', () => {
      mockTicket(
        makeTicket({
          status: 'resolved',
          category: 'install_equipment',
          resolved_at: '2026-08-20T14:30:00Z',
          pending_new_serial: 'SN-NEW-777',
          pending_new_model: null,
          intended_product_name: 'Modelo X',
        }),
      );
      renderDetail();
      expect(screen.queryByTestId('configure-equipment-inline')).not.toBeInTheDocument();
      expect(screen.getByText('Equipo instalado')).toBeInTheDocument();
      expect(screen.getByText('SN-NEW-777')).toBeInTheDocument();
      expect(screen.getByText('Modelo X')).toBeInTheDocument();
    });
  });

  describe('install_equipment category', () => {
    it('shows configure equipment inline and Finalizar tarea button', () => {
      mockTicket(
        makeTicket({
          category: 'install_equipment',
          title: 'Instalación SN-002',
          equipment_id: 'equip-new-001',
          pending_new_serial: null,
          pending_new_model: null,
          intended_product_name: 'Modelo X',
        }),
      );
      renderDetail();

      expect(screen.getByText('Instalación de equipo')).toBeInTheDocument();
      expect(screen.getByTestId('configure-equipment-inline')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Finalizar tarea' })).toBeInTheDocument();
    });
  });

  describe('replace_equipment category', () => {
    it('shows old equipment details, configure equipment inline, and Finalizar tarea button', () => {
      mockTicket(
        makeTicket({
          category: 'replace_equipment',
          title: 'Reemplazo SN-003',
          equipment_id: 'equip-old-001',
          pending_new_serial: null,
          pending_new_model: null,
          intended_product_name: 'Modelo Y',
        }),
      );
      mockUseEquipmentById.mockReturnValue({
        data: { serial_number: 'OLD-12345', model: 'Old Model', access_type: 'principal' },
        isLoading: false,
        isFetching: false,
      });
      renderDetail();

      expect(screen.getByText('Reemplazo de equipo')).toBeInTheDocument();
      expect(screen.getByText('Equipo a reemplazar')).toBeInTheDocument();
      expect(screen.getByText('OLD-12345')).toBeInTheDocument();
      expect(screen.getByTestId('configure-equipment-inline')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Finalizar tarea' })).toBeInTheDocument();
    });
  });

  describe('maintain_equipment category', () => {
    it('shows equipment details and Finalizar tarea button', () => {
      mockTicket(
        makeTicket({
          category: 'maintain_equipment',
          title: 'Mantenimiento SN-004',
          equipment_id: 'equip-maint-001',
        }),
      );
      mockUseEquipmentById.mockReturnValue({
        data: { serial_number: 'MAINT-999', model: 'Maint Model', status: 'active' },
        isLoading: false,
        isFetching: false,
      });
      mockUseMaintenanceHistory.mockReturnValue({ data: [], isLoading: false, isFetching: false });
      renderDetail();

      expect(screen.getByText('Mantenimiento')).toBeInTheDocument();
      expect(screen.getByText('Equipo a mantener')).toBeInTheDocument();
      expect(screen.getByText('MAINT-999')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Finalizar tarea' })).toBeInTheDocument();
    });

    it('shows maintenance history when prior records exist', () => {
      mockTicket(
        makeTicket({
          category: 'maintain_equipment',
          title: 'Mantenimiento SN-004',
          equipment_id: 'equip-maint-001',
        }),
      );
      mockUseEquipmentById.mockReturnValue({
        data: { serial_number: 'MAINT-999', model: 'Maint Model', status: 'active' },
        isLoading: false,
        isFetching: false,
      });
      mockUseMaintenanceHistory.mockReturnValue({
        data: [
          {
            id: 't-prev',
            title: 'Mantenimiento previo',
            status: 'resolved',
            category: 'maintain_equipment',
            opened_at: '2026-01-01T00:00:00Z',
            resolved_at: '2026-01-05T00:00:00Z',
            resolution_notes: 'Todo ok',
          },
        ],
        isLoading: false,
        isFetching: false,
      });
      renderDetail();

      expect(screen.getByText('Mantenimientos anteriores del equipo (1)')).toBeInTheDocument();
      expect(screen.getByText('Mantenimiento previo')).toBeInTheDocument();
    });
  });

  describe('update_equipment without snapshot', () => {
    it('shows the not-found error message', () => {
      mockTicket(
        makeTicket({
          category: 'update_equipment',
          title: 'Actualización sin snapshot',
          equipmentUpdateSnapshot: undefined,
        }),
      );
      renderDetail();

      expect(
        screen.getByText(/No se encontró la tarea de actualización asociada a este ticket/),
      ).toBeInTheDocument();
    });
  });
});
