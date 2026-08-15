import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

import { TechnicalItemsTable } from '../TechnicalItemsTable';
import type { OrderItemRow } from '@/hooks/useOrden';

const itemMantenimiento: OrderItemRow = {
  id: 'it-1',
  order_id: 'ord-1',
  item_type: 'maintenance',
  quantity: 2,
  description: 'Cambio de burlete',
  status: 'completed',
  building_id: null,
  unit_id: null,
  unit_price: null,
  product_id: null,
  produced_key_id: null,
  pickup_particular_id: null,
  pickup_particulares: null,
  rfid_keys: null,
};

const itemSinDescripcion: OrderItemRow = {
  ...itemMantenimiento,
  id: 'it-2',
  item_type: 'installation',
  description: null,
  quantity: 1,
};

function makeItems(count: number): OrderItemRow[] {
  return Array.from({ length: count }, (_, i) => ({
    ...itemMantenimiento,
    id: `it-${i + 1}`,
    quantity: i + 1,
  }));
}

function makeWrapper() {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter>{children}</MemoryRouter>;
  };
}

describe('TechnicalItemsTable', () => {
  it('renders rows with category label, description fallback and quantity', () => {
    render(
      <TechnicalItemsTable items={[itemMantenimiento, itemSinDescripcion]} />,
      { wrapper: makeWrapper() },
    );

    expect(screen.getByText('Mantenimiento')).toBeInTheDocument();
    expect(screen.getByText('Instalación')).toBeInTheDocument();
    expect(screen.getByText('Cambio de burlete')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    // null description renders the dash fallback
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('falls through to the raw item_type when no label exists', () => {
    render(
      <TechnicalItemsTable items={[{ ...itemMantenimiento, item_type: 'equipment_replacement' }]} />,
      { wrapper: makeWrapper() },
    );

    expect(screen.getByText('equipment_replacement')).toBeInTheDocument();
  });

  it('renders the first cell as plain emphasized text (no link or row actions)', () => {
    render(<TechnicalItemsTable items={[itemMantenimiento]} />, { wrapper: makeWrapper() });

    expect(screen.getByText('Mantenimiento')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    // Only the pagination nav buttons exist — no row action buttons.
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toHaveAttribute('aria-label', 'Página anterior');
    expect(buttons[1]).toHaveAttribute('aria-label', 'Página siguiente');
  });

  it('renders the loading skeleton while fetching', () => {
    render(<TechnicalItemsTable items={[]} isFetching />, { wrapper: makeWrapper() });

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('Tipo')).toBeInTheDocument();
    // header + 3 pulse skeleton rows
    expect(screen.getAllByRole('row')).toHaveLength(4);
    expect(screen.queryByText('Sin ítems')).not.toBeInTheDocument();
  });

  it('shows the empty state when there are no items', () => {
    render(<TechnicalItemsTable items={[]} />, { wrapper: makeWrapper() });

    expect(screen.getByText('Sin ítems')).toBeInTheDocument();
  });

  it('renders the pagination footer and only the first 10 rows', () => {
    render(<TechnicalItemsTable items={makeItems(12)} />, { wrapper: makeWrapper() });

    expect(screen.getByText('1–10 de 12')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(11); // 1 header + 10 body rows
  });
});
