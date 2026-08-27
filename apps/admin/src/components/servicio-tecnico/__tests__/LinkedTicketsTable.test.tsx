import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import type { ReactNode } from 'react';
import type { TechnicalOrderTicketRow } from '@/hooks/useTechnicalOrderTickets';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import { LinkedTicketsTable } from '../LinkedTicketsTable';

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </MemoryRouter>
    );
  };
}

function makeTicket(overrides: Partial<TechnicalOrderTicketRow> = {}): TechnicalOrderTicketRow {
  return {
    id: 'ticket-1',
    ticket_number: 'TKT-001',
    category: 'maintenance',
    status: 'open',
    description: 'Revisar equipo',
    technical_order_item_id: 'item-1',
    assigned_to_staff_id: 'staff-1',
    created_at: '2026-08-10T12:00:00Z',
    resolved_at: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('LinkedTicketsTable — row rendering', () => {
  it('renders a row for each ticket', () => {
    const tickets = [
      makeTicket({ id: 'ticket-1', ticket_number: 'TKT-001' }),
      makeTicket({ id: 'ticket-2', ticket_number: 'TKT-002' }),
    ];
    render(
      <LinkedTicketsTable tickets={tickets} isLoading={false} />,
      { wrapper: makeWrapper() },
    );
    const rows = screen.getAllByRole('row');
    expect(rows.length).toBeGreaterThanOrEqual(3);
  });

  it('renders ticket_number in the table', () => {
    render(
      <LinkedTicketsTable tickets={[makeTicket({ ticket_number: 'TKT-999' })]} isLoading={false} />,
      { wrapper: makeWrapper() },
    );
    expect(screen.getByText('TKT-999')).toBeInTheDocument();
  });
});

describe('LinkedTicketsTable — empty state', () => {
  it('shows empty message when no tickets', () => {
    render(
      <LinkedTicketsTable tickets={[]} isLoading={false} />,
      { wrapper: makeWrapper() },
    );
    expect(screen.getByText(/sin tickets/i)).toBeInTheDocument();
  });
});

describe('LinkedTicketsTable — status badge', () => {
  it('shows open status badge', () => {
    render(
      <LinkedTicketsTable tickets={[makeTicket({ status: 'open' })]} isLoading={false} />,
      { wrapper: makeWrapper() },
    );
    expect(screen.getByText(/pendiente/i)).toBeInTheDocument();
  });

  it('shows resolved status badge', () => {
    render(
      <LinkedTicketsTable
        tickets={[makeTicket({ status: 'resolved', resolved_at: '2026-08-11T10:00:00Z' })]}
        isLoading={false}
      />,
      { wrapper: makeWrapper() },
    );
    expect(screen.getByText(/finalizada/i)).toBeInTheDocument();
  });
});

describe('LinkedTicketsTable — loading state', () => {
  it('renders loading skeleton when isLoading is true', () => {
    const { container } = render(
      <LinkedTicketsTable tickets={[]} isLoading={true} />,
      { wrapper: makeWrapper() },
    );
    expect(container.querySelector('.animate-pulse')).not.toBeNull();
  });
});
