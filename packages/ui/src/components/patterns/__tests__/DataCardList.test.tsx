import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { PencilLine, Eye, Trash2 } from 'lucide-react';

import { DataCardList, type DataCardListProps } from '../DataCardList';
import type { DataTableAction, DataTableColumn } from '../DataTable';

interface Item {
  id: string;
  name: string;
  status: string;
  meta1: string;
  meta2: string;
  closedAt: string;
}

function makeRow(index: number, overrides: Partial<Item> = {}): Item {
  return {
    id: `r-${index + 1}`,
    name: `Item ${index + 1}`,
    status: 'ok',
    meta1: `Meta1-${index + 1}`,
    meta2: `Meta2-${index + 1}`,
    closedAt: '2026-01-01T10:00:00.000Z',
    ...overrides,
  };
}

function makeRows(count: number): Item[] {
  return Array.from({ length: count }, (_, i) => makeRow(i));
}

const baseColumns: DataTableColumn<Item>[] = [
  { header: 'Nombre', cell: (row) => row.name },
  { header: 'Estado', cell: (row) => row.status, card: 'status' },
  { header: 'Meta 1', cell: (row) => row.meta1 },
  { header: 'Meta 2', cell: (row) => row.meta2, hideBelow: 'md' },
];

function renderList(props: Partial<DataCardListProps<Item>> = {}) {
  const listProps: DataCardListProps<Item> = {
    rows: makeRows(3),
    columns: baseColumns,
    rowKey: (row) => row.id,
    ...props,
  };
  return render(
    <MemoryRouter>
      <DataCardList {...listProps} />
    </MemoryRouter>,
  );
}

describe('DataCardList', () => {
  it('infers index 0 as title and remaining columns as meta in declaration order', () => {
    const columns: DataTableColumn<Item>[] = [
      { header: 'Nombre', cell: (row) => row.name },
      { header: 'Meta 1', cell: (row) => row.meta1 },
      { header: 'Meta 2', cell: (row) => row.meta2 },
    ];
    renderList({ columns, rows: makeRows(1) });

    const [card] = screen.getAllByRole('listitem');
    expect(within(card!).getByText('Item 1')).toBeInTheDocument();
    const metaLabels = within(card!).getAllByText(/Meta \d/);
    expect(metaLabels.map((el) => el.textContent)).toEqual(['Meta 1', 'Meta 2']);
  });

  it('honors an explicit card: "status" slot and renders it in the card action area', () => {
    renderList({ rows: makeRows(1) });
    const [card] = screen.getAllByRole('listitem');
    expect(within(card!).getByText('ok')).toBeInTheDocument();
  });

  it('does not render a column explicitly marked card: "hidden"', () => {
    const columns: DataTableColumn<Item>[] = [
      { header: 'Nombre', cell: (row) => row.name },
      { header: 'Oculto', cell: () => 'secreto', card: 'hidden' },
    ];
    renderList({ columns, rows: makeRows(1) });
    expect(screen.queryByText('secreto')).not.toBeInTheDocument();
  });

  it('ignores hideBelow for visibility in card mode', () => {
    renderList({ rows: makeRows(1) });
    const [card] = screen.getAllByRole('listitem');
    expect(within(card!).getByText('Meta2-1')).toBeInTheDocument();
  });

  it('applies the compact density grid class', () => {
    const { container } = renderList({ density: 'compact' });
    expect(container.querySelector('ul')).toHaveClass(
      'grid-cols-[repeat(auto-fit,minmax(18rem,1fr))]',
    );
  });

  it('applies the comfortable density grid class', () => {
    const { container } = renderList({ density: 'comfortable' });
    expect(container.querySelector('ul')).toHaveClass(
      'grid-cols-[repeat(auto-fit,minmax(22rem,1fr))]',
    );
  });

  it('applies the full density grid class', () => {
    const { container } = renderList({ density: 'full' });
    expect(container.querySelector('ul')).toHaveClass('grid-cols-1');
  });

  it('groups rows by groupBy and renders a SectionHeading per group in descending key order', () => {
    const rows: Item[] = [
      makeRow(0, { id: 'a', closedAt: '2026-01-01T10:00:00.000Z' }),
      makeRow(0, { id: 'b', closedAt: '2026-01-03T10:00:00.000Z' }),
      makeRow(0, { id: 'c', closedAt: '2026-01-02T10:00:00.000Z' }),
    ];
    renderList({
      rows,
      groupBy: (row) => row.closedAt.slice(0, 10),
      groupLabel: (key) => `Día ${key}`,
    });

    const headings = screen.getAllByRole('heading', { level: 2 });
    expect(headings.map((h) => h.textContent)).toEqual([
      'Día 2026-01-03',
      'Día 2026-01-02',
      'Día 2026-01-01',
    ]);
  });

  it('paginates like DataTable and resets to page 1 when rows identity changes', async () => {
    const user = userEvent.setup();
    const { rerender } = renderList({ rows: makeRows(25) });

    expect(screen.getAllByRole('listitem')).toHaveLength(10);

    await user.click(screen.getByRole('button', { name: 'Página siguiente' }));
    expect(screen.getByText('Item 11')).toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <DataCardList rows={makeRows(25)} columns={baseColumns} rowKey={(row) => row.id} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Item 1')).toBeInTheDocument();
  });

  it('applies pagination before grouping', () => {
    const rows = makeRows(15).map((row, i) => ({
      ...row,
      closedAt: i < 12 ? '2026-01-01T00:00:00.000Z' : '2026-01-02T00:00:00.000Z',
    }));
    renderList({
      rows,
      groupBy: (row) => row.closedAt.slice(0, 10),
      groupLabel: (key) => key,
    });

    // Page 1 only contains the first 10 rows (all from day 2026-01-01), so
    // the 2026-01-02 group must not appear yet.
    expect(screen.queryByText('2026-01-02')).not.toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(10);
  });

  it('renders 3 skeleton cards while isFetching', () => {
    renderList({ isFetching: true, rows: [] });
    expect(screen.getAllByTestId('card-skeleton')).toHaveLength(3);
  });

  it('renders emptyMessage when there are no rows and no filters are active', () => {
    renderList({ rows: [], emptyMessage: 'Sin resultados', hasFilters: false });
    expect(screen.getByText('Sin resultados')).toBeInTheDocument();
  });

  it('renders filteredEmptyMessage when there are no rows and filters are active', () => {
    renderList({
      rows: [],
      emptyMessage: 'Sin resultados',
      filteredEmptyMessage: 'Nada coincide con el filtro',
      hasFilters: true,
    });
    expect(screen.getByText('Nada coincide con el filtro')).toBeInTheDocument();
  });

  it('renders primary actions as footer buttons and the rest in an overflow menu', () => {
    const onEdit = vi.fn();
    const onView = vi.fn();
    const onDelete = vi.fn();
    const actions: DataTableAction<Item>[] = [
      { icon: PencilLine, label: 'Editar', onClick: onEdit, primary: true },
      { icon: Eye, label: 'Ver', onClick: onView },
      { icon: Trash2, label: 'Eliminar', onClick: onDelete },
    ];
    renderList({ rows: makeRows(1), actions });

    expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ver' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Más acciones' })).toBeInTheDocument();
  });

  it('defaults up to 2 visible actions to primary when none set primary explicitly', () => {
    const onEdit = vi.fn();
    const onView = vi.fn();
    const actions: DataTableAction<Item>[] = [
      { icon: PencilLine, label: 'Editar', onClick: onEdit },
      { icon: Eye, label: 'Ver', onClick: onView },
    ];
    renderList({ rows: makeRows(1), actions });

    expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Más acciones' })).not.toBeInTheDocument();
  });

  it('renders the title as a stretched link using getRowHref', () => {
    renderList({ rows: makeRows(1), firstCell: 'link', getRowHref: (row) => `/items/${row.id}` });
    const link = screen.getByRole('link', { name: 'Item 1' });
    expect(link).toHaveAttribute('href', '/items/r-1');
    expect(link).toHaveClass('after:absolute');
    expect(link).toHaveClass('after:inset-0');
  });

  it('does not navigate when clicking an action even though the title is a stretched link', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    renderList({
      rows: makeRows(1),
      firstCell: 'link',
      getRowHref: (row) => `/items/${row.id}`,
      actions: [{ icon: PencilLine, label: 'Editar', onClick: onEdit, primary: true }],
    });

    await user.click(screen.getByRole('button', { name: 'Editar' }));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('never renders a <table> element regardless of viewport width', () => {
    const originalWidth = window.innerWidth;

    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 360 });
    const { container, rerender } = renderList({ rows: makeRows(20) });
    expect(container.querySelector('table')).not.toBeInTheDocument();

    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1440,
    });
    rerender(
      <MemoryRouter>
        <DataCardList rows={makeRows(20)} columns={baseColumns} rowKey={(row) => row.id} />
      </MemoryRouter>,
    );
    expect(container.querySelector('table')).not.toBeInTheDocument();

    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: originalWidth,
    });
  });
});
