import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import type { ReactNode } from 'react';
import type { TareaRow } from '@/hooks/useTareas';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { TareasTable } from '../TareasTable';

const tareaAbierta: TareaRow = {
  id: 't-1',
  ticket_number: 'T-0001',
  category: 'maintain_equipment',
  description: 'Cambiar cilindro de la puerta principal',
  status: 'open',
  building_id: 'b-1',
  building: {
    id: 'b-1',
    name: 'Torre Norte',
    administration: { id: 'adm-1', company_name: 'Admin García S.A.' },
  },
  equipment_id: null,
  assigned_to_staff_id: 's-1',
  assigned_to_name: 'Ana Gómez',
  opened_by_staff_id: 's-1',
  opened_by_name: 'Ana Gómez',
  opened_at: '2026-08-10T12:00:00Z',
  updated_at: '2026-08-10T12:00:00Z',
  resolution_notes: null,
  cancellation_reason: null,
  notes: null,
};

const tareaSinDatos: TareaRow = {
  id: 't-2',
  ticket_number: 'T-0002',
  category: 'maintain_equipment',
  description: 'Revisar portero eléctrico',
  status: 'cancelled',
  building_id: 'b-2',
  building: null,
  equipment_id: null,
  assigned_to_staff_id: null,
  assigned_to_name: null,
  opened_by_staff_id: null,
  opened_by_name: null,
  opened_at: '2026-08-09T08:00:00Z',
  updated_at: '2026-08-09T08:00:00Z',
  resolution_notes: null,
  cancellation_reason: 'No responde el consorcio',
  notes: null,
};

function makeTareas(count: number): TareaRow[] {
  return Array.from({ length: count }, (_, i) => ({
    ...tareaAbierta,
    id: `t-${i + 1}`,
    ticket_number: `T-${String(i + 1).padStart(4, '0')}`,
  }));
}

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(
      MemoryRouter,
      null,
      React.createElement(QueryClientProvider, { client: queryClient }, children),
    );
  };
}

describe('TareasTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders one card per ticket instead of a table, with the ticket number as title', () => {
    render(
      <TareasTable rows={[tareaAbierta, tareaSinDatos]} isFetching={false} hasFilters={false} />,
      { wrapper: makeWrapper() },
    );

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);

    // Ticket number stays the clean title — unlike installer's pilot, admin's
    // title was never messy free text, so it is NOT swapped for the category.
    const link = screen.getByRole('link', { name: 'T-0001' });
    expect(link).toHaveAttribute('href', '/tareas/t-1');

    expect(screen.getByText('Cambiar cilindro de la puerta principal')).toBeInTheDocument();
    expect(screen.getByText('Torre Norte')).toBeInTheDocument();
    expect(screen.getByText('Admin García S.A.')).toBeInTheDocument();
    expect(screen.getByText('Ana Gómez')).toBeInTheDocument();
    expect(screen.getAllByText('Mantenimiento').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Pendiente')).toBeInTheDocument();
    expect(screen.getByText('Cancelada')).toBeInTheDocument();
  });

  it('renders a decorative category icon in the card, before the title', () => {
    render(<TareasTable rows={[tareaAbierta]} isFetching={false} hasFilters={false} />, {
      wrapper: makeWrapper(),
    });
    const [card] = screen.getAllByRole('listitem');
    const icon = card!.querySelector('svg[aria-hidden="true"]');
    expect(icon).toBeInTheDocument();
  });

  it('renders fallback dashes and labels for rows without data', () => {
    render(<TareasTable rows={[tareaSinDatos]} isFetching={false} hasFilters={false} />, {
      wrapper: makeWrapper(),
    });

    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('Sin asignar')).toBeInTheDocument();
    expect(screen.getByText('Mantenimiento')).toBeInTheDocument();
    expect(screen.getByText('Cancelada')).toBeInTheDocument();
  });

  it('renders the loading skeleton while fetching', () => {
    const { container } = render(<TareasTable rows={[]} isFetching hasFilters={false} />, {
      wrapper: makeWrapper(),
    });

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('shows the empty state when there are no rows and no filters', () => {
    render(<TareasTable rows={[]} isFetching={false} hasFilters={false} />, {
      wrapper: makeWrapper(),
    });

    expect(screen.getByText('No hay tareas registradas.')).toBeInTheDocument();
  });

  it('shows the filtered empty state when filters are applied', () => {
    render(<TareasTable rows={[]} isFetching={false} hasFilters />, {
      wrapper: makeWrapper(),
    });

    expect(
      screen.getByText('No se encontraron tareas con los filtros aplicados.'),
    ).toBeInTheDocument();
  });

  it('renders the pagination footer and only the first 10 rows', () => {
    render(<TareasTable rows={makeTareas(12)} isFetching={false} hasFilters={false} />, {
      wrapper: makeWrapper(),
    });

    expect(screen.getByText('1–10 de 12')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(10);
  });

  it('renders an Editar button with aria-label only when onEdit is provided', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();

    const { rerender } = render(
      <TareasTable rows={[tareaAbierta]} isFetching={false} hasFilters={false} />,
      { wrapper: makeWrapper() },
    );
    expect(screen.queryByRole('button', { name: /editar/i })).not.toBeInTheDocument();

    rerender(
      <TareasTable rows={[tareaAbierta]} isFetching={false} hasFilters={false} onEdit={onEdit} />,
    );
    await user.click(screen.getByRole('button', { name: 'Editar a T-0001' }));
    expect(onEdit).toHaveBeenCalledWith(tareaAbierta);
  });

  it('renders the Editar button with a short visible label spanning the full row width', () => {
    render(
      <TareasTable rows={[tareaAbierta]} isFetching={false} hasFilters={false} onEdit={vi.fn()} />,
      { wrapper: makeWrapper() },
    );

    const editButton = screen.getByRole('button', { name: 'Editar a T-0001' });
    expect(editButton).toHaveTextContent('Editar');
    expect(editButton).toHaveClass('w-full');
  });
});
