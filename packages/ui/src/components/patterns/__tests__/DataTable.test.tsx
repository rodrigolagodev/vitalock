import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { PencilLine, Eye } from 'lucide-react';
import React from 'react';

import { DataTable, type DataTableAction, type DataTableColumn, type DataTableProps } from '../DataTable';

interface Item {
  id: string;
  name: string;
  status: string;
}

const baseColumns: DataTableColumn<Item>[] = [
  { header: 'Nombre', cell: (row) => row.name },
  { header: 'Estado', cell: (row) => row.status },
];

function makeRows(count: number): Item[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `r-${i + 1}`,
    name: `Item ${i + 1}`,
    status: 'ok',
  }));
}

function renderTable(props: Partial<DataTableProps<Item>> = {}) {
  const tableProps: DataTableProps<Item> = {
    rows: makeRows(3),
    columns: baseColumns,
    rowKey: (row) => row.id,
    ...props,
  };
  return render(
    <MemoryRouter>
      <DataTable {...tableProps} />
    </MemoryRouter>,
  );
}

describe('DataTable', () => {
  it('renders the wrapper, header row and column headers', () => {
    renderTable();

    const table = screen.getByRole('table');
    expect(table.closest('div')?.parentElement).toHaveClass('overflow-hidden');
    expect(screen.getByText('Nombre')).toBeInTheDocument();
    expect(screen.getByText('Estado')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(4); // header + 3 data rows
  });

  it('renders a 3-row pulse skeleton with no links while fetching', () => {
    renderTable({ isFetching: true, rows: [] });

    const skeletonRows = document.querySelectorAll('tbody tr');
    expect(skeletonRows).toHaveLength(3);
    expect(document.querySelectorAll('tbody tr div.animate-pulse, tbody tr div.h-4')).not.toHaveLength(0);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('shows emptyMessage when there are no rows and no filters', () => {
    renderTable({ rows: [], emptyMessage: 'No hay ítems registrados.' });

    expect(screen.getByText('No hay ítems registrados.')).toBeInTheDocument();
  });

  it('shows filteredEmptyMessage when there are no rows and filters are applied', () => {
    renderTable({
      rows: [],
      hasFilters: true,
      filteredEmptyMessage: 'No se encontraron ítems con los filtros aplicados.',
    });

    expect(
      screen.getByText('No se encontraron ítems con los filtros aplicados.'),
    ).toBeInTheDocument();
  });

  it('renders the first cell as a link with the row href', () => {
    renderTable({ firstCell: 'link', getRowHref: (row) => `/ordenes/${row.id}` });

    const link = screen.getByRole('link', { name: 'Item 1' });
    expect(link).toHaveAttribute('href', '/ordenes/r-1');
    expect(link).toHaveClass('font-medium');
  });

  it('renders the first cell as a button that opens a dialog without navigating', async () => {
    const user = userEvent.setup();
    const onFirstCellClick = vi.fn();
    renderTable({ firstCell: 'button', onFirstCellClick });

    const button = screen.getByRole('button', { name: 'Item 1' });
    expect(button.tagName).toBe('BUTTON');
    expect(button.closest('a')).toBeNull();

    await user.click(button);
    expect(onFirstCellClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'r-1' }));
  });

  it('renders the first cell as emphasized text by default', () => {
    renderTable();

    const cell = screen.getByText('Item 1');
    expect(cell.tagName).toBe('SPAN');
    expect(cell).toHaveClass('font-medium');
  });

  it('renders icon-only actions with Spanish aria-labels and no visible text', () => {
    const actions: DataTableAction<Item>[] = [
      { icon: PencilLine, label: (row) => `Editar a ${row.name}`, onClick: vi.fn() },
      { icon: Eye, label: (row) => `Ver detalles de ${row.name}`, onClick: vi.fn() },
    ];
    renderTable({ actions });

    const edit = screen.getByRole('button', { name: 'Editar a Item 1' });
    expect(edit).toBeInTheDocument();
    expect(within(edit).queryByText(/editar/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver detalles de Item 1' })).toBeInTheDocument();
    expect(screen.getByText('Acciones')).toBeInTheDocument();
  });

  it('hides the actions column when no actions are configured', () => {
    renderTable();

    expect(screen.queryByText('Acciones')).not.toBeInTheDocument();
  });

  it('hides an action when its show predicate returns false', () => {
    const actions: DataTableAction<Item>[] = [
      { icon: Eye, label: 'Visible', onClick: vi.fn() },
      { icon: PencilLine, label: 'Oculto', onClick: vi.fn(), show: () => false },
    ];
    renderTable({ actions });

    expect(screen.queryByRole('button', { name: 'Oculto' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Visible' })).toHaveLength(3);
  });

  it('disables an action button when its disabled predicate returns true', () => {
    const actions: DataTableAction<Item>[] = [
      { icon: PencilLine, label: 'Bloqueado', onClick: vi.fn(), disabled: () => true },
    ];
    renderTable({ actions });

    expect(screen.getAllByRole('button', { name: 'Bloqueado' })[0]).toBeDisabled();
  });

  it('disables and pulses the icon while an action is loading', () => {
    const actions: DataTableAction<Item>[] = [
      { icon: PencilLine, label: 'Cargando', onClick: vi.fn(), loading: () => true },
    ];
    renderTable({ actions });

    const button = screen.getAllByRole('button', { name: 'Cargando' })[0]!;
    expect(button).toBeDisabled();
    const icon = button.querySelector('svg');
    expect(icon?.classList.contains('animate-pulse')).toBe(true);
  });

  it('allows keyboard focus to reach each action button and activate it with Enter', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const actions: DataTableAction<Item>[] = [
      { icon: PencilLine, label: 'Editar', onClick },
    ];
    renderTable({ actions });

    await user.tab();
    expect(document.activeElement).toBe(
      screen.getAllByRole('button', { name: 'Editar' })[0],
    );
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders custom content via the renderActions escape hatch', () => {
    renderTable({
      renderActions: (row) => (
        <button type="button">Toggle {row.name}</button>
      ),
    });

    expect(screen.getByRole('button', { name: 'Toggle Item 1' })).toBeInTheDocument();
    expect(screen.getByText('Acciones')).toBeInTheDocument();
  });

  it('uses actionsHeaderLabel when provided', () => {
    const actions: DataTableAction<Item>[] = [
      { icon: PencilLine, label: 'Editar', onClick: vi.fn() },
    ];
    renderTable({ actions, actionsHeaderLabel: 'Opciones' });

    expect(screen.getByText('Opciones')).toBeInTheDocument();
    expect(screen.queryByText('Acciones')).not.toBeInTheDocument();
  });

  it('paginates the rows and renders the footer slice label', () => {
    renderTable({ rows: makeRows(25) });

    expect(screen.getByText('1–10 de 25')).toBeInTheDocument();
    // page 1 shows rows 1..10
    expect(screen.getByText('Item 1')).toBeInTheDocument();
    expect(screen.queryByText('Item 11')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Página anterior' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Página siguiente' })).toBeEnabled();
  });

  it('navigates pages with the footer controls', async () => {
    const user = userEvent.setup();
    renderTable({ rows: makeRows(25) });

    await user.click(screen.getByRole('button', { name: 'Página siguiente' }));
    expect(screen.getByText('11–20 de 25')).toBeInTheDocument();
    expect(screen.getByText('Item 11')).toBeInTheDocument();
  });

  it('renders the footer for small lists with disabled navigation', () => {
    renderTable({ rows: makeRows(3) });

    expect(screen.getByText('1–3 de 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Página anterior' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Página siguiente' })).toBeDisabled();
  });

  it('resets page and page size when the rows change', async () => {
    const user = userEvent.setup();
    const { rerender } = renderTable({ rows: makeRows(25) });

    // move to page 2 with a larger page size
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filas por página' }), '20');
    expect(screen.getByText('1–20 de 25')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Página siguiente' }));
    expect(screen.getByText('21–25 de 25')).toBeInTheDocument();

    // rows change (filter) → page 1 and default page size
    const tableProps: DataTableProps<Item> = {
      rows: makeRows(5),
      columns: baseColumns,
      rowKey: (row) => row.id,
    };
    rerender(
      <MemoryRouter>
        <DataTable {...tableProps} />
      </MemoryRouter>,
    );

    expect(screen.getByText('1–5 de 5')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Página anterior' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Filas por página' })).toHaveValue('10');
  });
});
