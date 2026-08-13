import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

// Import through the package entry point — the public contract consumers
// (admin + installer) will rely on.
import {
  DEFAULT_PAGE_SIZE,
  PaginationFooter,
  ROWS_PER_PAGE_OPTIONS,
  StatCard,
  getPageSlice,
} from '@vitalock/ui';

const twentyFiveRows = Array.from({ length: 25 }, (_, i) => `fila-${i + 1}`);

describe('pagination constants', () => {
  it('defaults to 10 rows per page', () => {
    expect(DEFAULT_PAGE_SIZE).toBe(10);
  });

  it('offers 10, 20 and 50 rows per page', () => {
    expect(ROWS_PER_PAGE_OPTIONS).toEqual([10, 20, 50]);
  });
});

describe('getPageSlice', () => {
  it('returns the first pageSize rows for page 1', () => {
    const page1 = getPageSlice(twentyFiveRows, 1, 10);
    expect(page1).toHaveLength(10);
    expect(page1[0]).toBe('fila-1');
    expect(page1[9]).toBe('fila-10');
  });

  it('returns the next pageSize rows for page 2', () => {
    const page2 = getPageSlice(twentyFiveRows, 2, 10);
    expect(page2).toHaveLength(10);
    expect(page2[0]).toBe('fila-11');
  });

  it('returns the partial remainder on the last page', () => {
    const page3 = getPageSlice(twentyFiveRows, 3, 10);
    expect(page3).toHaveLength(5);
    expect(page3[4]).toBe('fila-25');
  });
});

describe('StatCard', () => {
  it('renders the label and the KPI value', () => {
    render(<StatCard label="Total" value={42} />);
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('renders a neutral placeholder when the value is empty', () => {
    render(<StatCard label="Stock bajo" value={null} />);
    expect(screen.getByText('Stock bajo')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders zero without falling back to the placeholder', () => {
    render(<StatCard label="Stock bajo" value={0} />);
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.queryByText('—')).not.toBeInTheDocument();
  });

  it('renders the icon chip when an icon is provided', () => {
    render(<StatCard label="Activas" value={3} icon={<span>icono</span>} />);
    expect(screen.getByText('icono')).toBeInTheDocument();
  });
});

describe('PaginationFooter', () => {
  it('renders the range summary, rows-per-page selector and nav buttons', () => {
    render(
      <PaginationFooter
        total={25}
        page={1}
        pageSize={10}
        onPageChange={() => {}}
        onPageSizeChange={() => {}}
      />,
    );

    expect(screen.getByText('1–10 de 25')).toBeInTheDocument();
    expect(screen.getByText('Filas por página:')).toBeInTheDocument();

    const options = screen.getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['10', '20', '50']);

    expect(
      screen.getByRole('button', { name: 'Página anterior' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Página siguiente' }),
    ).toBeInTheDocument();
  });

  it('disables prev on the first page and next on the last page', () => {
    const { rerender } = render(
      <PaginationFooter
        total={25}
        page={1}
        pageSize={10}
        onPageChange={() => {}}
        onPageSizeChange={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'Página anterior' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Página siguiente' }),
    ).toBeEnabled();

    rerender(
      <PaginationFooter
        total={25}
        page={3}
        pageSize={10}
        onPageChange={() => {}}
        onPageSizeChange={() => {}}
      />,
    );
    expect(screen.getByText('21–25 de 25')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Página anterior' })).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Página siguiente' }),
    ).toBeDisabled();
  });

  it('fires onPageChange when navigating', () => {
    const onPageChange = vi.fn();
    render(
      <PaginationFooter
        total={25}
        page={1}
        pageSize={10}
        onPageChange={onPageChange}
        onPageSizeChange={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('fires onPageSizeChange when the rows-per-page selector changes', () => {
    const onPageSizeChange = vi.fn();
    render(
      <PaginationFooter
        total={25}
        page={1}
        pageSize={10}
        onPageChange={() => {}}
        onPageSizeChange={onPageSizeChange}
      />,
    );
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '50' } });
    expect(onPageSizeChange).toHaveBeenCalledWith(50);
  });
});
