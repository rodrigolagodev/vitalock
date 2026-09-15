import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TareasTable } from '../TareasTable';
import type { AssignedTicket } from '@/hooks/useAssignedTickets';

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
    equipmentUpdateSnapshot: null,
    pending_new_serial: null,
    pending_new_model: null,
    intended_product_name: null,
    ...overrides,
  };
}

function renderTable(rows: AssignedTicket[], isLoading = false) {
  return render(
    <MemoryRouter>
      <TareasTable rows={rows} isLoading={isLoading} />
    </MemoryRouter>,
  );
}

describe('TareasTable', () => {
  it('renders one card per ticket instead of a table', () => {
    const { container } = renderTable([makeTicket('1'), makeTicket('2')]);
    expect(container.querySelector('table')).not.toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('links each card title to the task detail route, showing the clean category label — not the raw free-text description', () => {
    renderTable([
      makeTicket('abc-123', {
        title: 'una descripción medio rara escrita por el admin',
        category: 'maintain_equipment',
      }),
    ]);
    expect(screen.getByRole('link', { name: 'Mantenimiento' })).toHaveAttribute(
      'href',
      '/tareas/abc-123',
    );
    expect(
      screen.queryByText('una descripción medio rara escrita por el admin'),
    ).not.toBeInTheDocument();
  });

  it('renders a decorative category icon in the card, before the title', () => {
    renderTable([makeTicket('1', { category: 'install_equipment' })]);
    const [card] = screen.getAllByRole('listitem');
    const icon = card!.querySelector('svg[aria-hidden="true"]');
    expect(icon).toBeInTheDocument();
  });

  it('no longer shows a separate "Categoría" field — the category is now the title', () => {
    renderTable([makeTicket('1', { category: 'update_equipment' })]);
    expect(screen.queryByText('Categoría')).not.toBeInTheDocument();
  });

  it('renders the ticket status badge in the card action area', () => {
    renderTable([makeTicket('1', { status: 'in_progress' })]);
    expect(screen.getByText('En curso')).toBeInTheDocument();
  });

  it('shows the building name exactly once per card — no duplicate md:hidden fake-card line', () => {
    renderTable([makeTicket('1')]);
    const [card] = screen.getAllByRole('listitem');
    expect(within(card!).getAllByText('Edificio Uno')).toHaveLength(1);
  });

  it('shows the key activation/deactivation summary as card metadata', () => {
    renderTable([
      makeTicket('1', {
        equipmentUpdateSnapshot: {
          task_id: 'task-1',
          equipment_id: 'eq-1',
          mdb_storage_path: 'tickets/1/db.mdb',
          keys_to_activate: ['k1', 'k2'],
          keys_to_disable: ['k3'],
        },
      }),
    ]);
    expect(screen.getByText('2 alta / 1 baja')).toBeInTheDocument();
  });

  it('shows the empty state when there are no tickets', () => {
    renderTable([]);
    expect(screen.getByText('Estás al día. No tenés tareas pendientes.')).toBeInTheDocument();
  });
});
