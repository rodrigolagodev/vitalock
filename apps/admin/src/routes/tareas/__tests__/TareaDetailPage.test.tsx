import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import React from 'react';
import type { TareaDetailRow } from '@/hooks/useTarea';

// Hoist mocks for vi.mock hoisting requirement
const { useTareaMock } = vi.hoisted(() => ({
  useTareaMock: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/hooks/useTarea', () => ({ useTarea: useTareaMock }));
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
