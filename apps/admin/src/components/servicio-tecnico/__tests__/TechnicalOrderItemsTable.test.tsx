import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import type { ReactNode } from 'react';
import type { TechnicalOrderItemRow } from '@/hooks/useTechnicalOrder';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import { TechnicalOrderItemsTable } from '../TechnicalOrderItemsTable';

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

function makeItem(overrides: Partial<TechnicalOrderItemRow> = {}): TechnicalOrderItemRow {
  return {
    id: 'item-1',
    order_id: 'to-1',
    item_type: 'maintenance',
    quantity: 1,
    description: 'Revision de sistema',
    status: 'pending',
    building_id: 'bld-1',
    unit_price: 500,
    product_id: null,
    intended_equipment_id: 'eq-1',
    intended_assignee_staff_id: 'staff-1',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('TechnicalOrderItemsTable — row rendering', () => {
  it('renders a row for each item', () => {
    const items = [makeItem({ id: 'item-1' }), makeItem({ id: 'item-2' })];
    render(
      <TechnicalOrderItemsTable items={items} />,
      { wrapper: makeWrapper() },
    );
    const rows = screen.getAllByRole('row');
    // header row + 2 data rows
    expect(rows.length).toBeGreaterThanOrEqual(3);
  });

  it('shows empty state when no items', () => {
    render(
      <TechnicalOrderItemsTable items={[]} />,
      { wrapper: makeWrapper() },
    );
    expect(screen.getByText(/sin ítems/i)).toBeInTheDocument();
  });
});

describe('TechnicalOrderItemsTable — item_type badge', () => {
  it('renders badge for maintenance item type', () => {
    render(
      <TechnicalOrderItemsTable items={[makeItem({ item_type: 'maintenance' })]} />,
      { wrapper: makeWrapper() },
    );
    expect(screen.getByText(/mantenimiento/i)).toBeInTheDocument();
  });

  it('renders badge for installation item type', () => {
    render(
      <TechnicalOrderItemsTable items={[makeItem({ item_type: 'installation' })]} />,
      { wrapper: makeWrapper() },
    );
    expect(screen.getByText(/instalación/i)).toBeInTheDocument();
  });

  it('renders badge for equipment_replacement item type', () => {
    render(
      <TechnicalOrderItemsTable items={[makeItem({ item_type: 'equipment_replacement' })]} />,
      { wrapper: makeWrapper() },
    );
    expect(screen.getByText(/reemplazo/i)).toBeInTheDocument();
  });
});

describe('TechnicalOrderItemsTable — status badge', () => {
  it('shows Pendiente badge for pending status', () => {
    render(
      <TechnicalOrderItemsTable items={[makeItem({ status: 'pending' })]} />,
      { wrapper: makeWrapper() },
    );
    expect(screen.getByText('Pendiente')).toBeInTheDocument();
  });

  it('shows En proceso badge for in_progress status', () => {
    render(
      <TechnicalOrderItemsTable items={[makeItem({ status: 'in_progress' })]} />,
      { wrapper: makeWrapper() },
    );
    expect(screen.getByText('En proceso')).toBeInTheDocument();
  });

  it('shows Completado badge for completed status', () => {
    render(
      <TechnicalOrderItemsTable items={[makeItem({ status: 'completed' })]} />,
      { wrapper: makeWrapper() },
    );
    expect(screen.getByText('Completado')).toBeInTheDocument();
  });
});

describe('TechnicalOrderItemsTable — intent fields', () => {
  it('renders intended_equipment_id UUID when no name is resolved', () => {
    render(
      <TechnicalOrderItemsTable
        items={[makeItem({ intended_equipment_id: 'eq-uuid-123' })]}
      />,
      { wrapper: makeWrapper() },
    );
    expect(screen.getByText('eq-uuid-123')).toBeInTheDocument();
  });

  it('renders dash when intended_equipment_id is null', () => {
    render(
      <TechnicalOrderItemsTable
        items={[makeItem({ intended_equipment_id: null })]}
      />,
      { wrapper: makeWrapper() },
    );
    // At least one dash rendered (both fields can be null)
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1);
  });
});
