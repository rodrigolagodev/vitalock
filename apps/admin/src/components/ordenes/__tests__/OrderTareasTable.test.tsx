import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

import { OrderTareasTable } from '../OrderTareasTable';
import type { OrderTareaRow } from '@/hooks/useOrderTareas';

const tareaAbierta: OrderTareaRow = {
  id: 't-1',
  ticket_number: 'T-0001',
  category: 'maintenance',
  status: 'open',
  description: 'Revisar portero eléctrico',
  order_item_id: 'it-1',
  assigned_to_staff_id: null,
  created_at: '2026-08-10T10:00:00Z',
  resolved_at: null,
};

const tareaEnCurso: OrderTareaRow = {
  ...tareaAbierta,
  id: 't-2',
  ticket_number: 'T-0002',
  category: 'equipment_installation',
  status: 'in_progress',
  description: 'Instalar molinete',
};

function makeTareas(count: number): OrderTareaRow[] {
  return Array.from({ length: count }, (_, i) => ({
    ...tareaAbierta,
    id: `t-${i + 1}`,
    ticket_number: `T-${String(i + 1).padStart(4, '0')}`,
  }));
}

function makeWrapper() {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter>{children}</MemoryRouter>;
  };
}

describe('OrderTareasTable', () => {
  it('renders rows with ticket link, category label, description and status badge', () => {
    render(<OrderTareasTable tareas={[tareaAbierta, tareaEnCurso]} />, {
      wrapper: makeWrapper(),
    });

    expect(screen.getByText('Mantenimiento')).toBeInTheDocument();
    expect(screen.getByText('Instalación de equipo')).toBeInTheDocument();
    expect(screen.getByText('Revisar portero eléctrico')).toBeInTheDocument();
    expect(screen.getByText('Instalar molinete')).toBeInTheDocument();
    expect(screen.getByText('Abierta')).toBeInTheDocument();
    expect(screen.getByText('En curso')).toBeInTheDocument();
  });

  it('links the ticket number to the tarea detail route', () => {
    render(<OrderTareasTable tareas={[tareaAbierta]} />, { wrapper: makeWrapper() });

    const ticketLink = screen.getByRole('link', { name: 'T-0001' });
    expect(ticketLink).toHaveAttribute('href', '/tareas/t-1');
  });

  it('falls through to the raw category when no label exists', () => {
    render(<OrderTareasTable tareas={[{ ...tareaAbierta, category: 'custom_type' }]} />, {
      wrapper: makeWrapper(),
    });

    expect(screen.getByText('custom_type')).toBeInTheDocument();
  });

  it('renders the loading skeleton while fetching', () => {
    render(<OrderTareasTable tareas={[]} isFetching />, { wrapper: makeWrapper() });

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('N.º')).toBeInTheDocument();
    // header + 3 pulse skeleton rows
    expect(screen.getAllByRole('row')).toHaveLength(4);
  });

  it('shows the empty state message verbatim when there are no tareas', () => {
    render(<OrderTareasTable tareas={[]} />, { wrapper: makeWrapper() });

    expect(screen.getByText('No hay tareas generadas para esta orden.')).toBeInTheDocument();
  });

  it('renders the pagination footer and only the first 10 rows', () => {
    render(<OrderTareasTable tareas={makeTareas(12)} />, { wrapper: makeWrapper() });

    expect(screen.getByText('1–10 de 12')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(11); // 1 header + 10 body rows
  });
});
