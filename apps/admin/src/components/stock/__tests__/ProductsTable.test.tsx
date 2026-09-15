import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { ProductsTable } from '../ProductsTable';
import type { ProductRow } from '@/types/stock';

function makeRow(overrides: Partial<ProductRow> = {}): ProductRow {
  return {
    id: 'p-1',
    name: 'Llave RFID estándar',
    category: 'rfid_key',
    cost_price: 500,
    stock_total: 10,
    stock_reservado: 2,
    stock_disponible: 8,
    created_at: '2026-07-01T10:00:00Z',
    updated_at: '2026-07-01T10:00:00Z',
    ...overrides,
  };
}

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('ProductsTable', () => {
  it('renders the product name', () => {
    renderWithRouter(<ProductsTable rows={[makeRow()]} isFetching={false} />);
    expect(screen.getByText('Llave RFID estándar')).toBeInTheDocument();
  });

  it('hides Categoría/Precio de costo below lg, Actualizado below xl, keeps Nombre/stock counts always visible', () => {
    renderWithRouter(<ProductsTable rows={[makeRow()]} isFetching={false} />);

    expect(screen.getByRole('columnheader', { name: 'Categoría' }).className).toContain(
      'lg:table-cell',
    );
    expect(screen.getByRole('columnheader', { name: 'Precio de costo' }).className).toContain(
      'lg:table-cell',
    );
    expect(screen.getByRole('columnheader', { name: 'Actualizado' }).className).toContain(
      'xl:table-cell',
    );
    expect(screen.getByRole('columnheader', { name: 'Nombre' }).className).not.toContain('hidden');
    expect(screen.getByRole('columnheader', { name: 'Stock total' }).className).not.toContain(
      'hidden',
    );
    expect(screen.getByRole('columnheader', { name: 'Reservado' }).className).not.toContain(
      'hidden',
    );
    expect(screen.getByRole('columnheader', { name: 'Disponible' }).className).not.toContain(
      'hidden',
    );
  });
});
