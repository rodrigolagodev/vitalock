import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import type { ReactNode } from 'react';
import type { TechnicalOrderItemRow } from '@/hooks/useTechnicalOrder';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const useEquipmentByIdsMock = vi.fn();
const useStaffByIdsMock = vi.fn();
vi.mock('@/hooks/useEquipmentByIds', () => ({
  useEquipmentByIds: (ids: readonly string[]) => useEquipmentByIdsMock(ids),
}));
vi.mock('@/hooks/useStaffByIds', () => ({
  useStaffByIds: (ids: readonly string[]) => useStaffByIdsMock(ids),
}));

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
    intended_replacement_equipment_id: null,
    intended_assignee_staff_id: 'staff-1',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useEquipmentByIdsMock.mockReturnValue({ data: undefined });
  useStaffByIdsMock.mockReturnValue({ data: undefined });
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
    expect(screen.getByText('Reemplazo de equipo')).toBeInTheDocument();
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

describe('TechnicalOrderItemsTable — intent fields (fallback UUID)', () => {
  it('renders intended_equipment_id UUID when Map does not resolve it', () => {
    useEquipmentByIdsMock.mockReturnValue({ data: new Map() });
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

describe('TechnicalOrderItemsTable — intent fields (resolved names)', () => {
  it('resolves equipment serial_number via useEquipmentByIds', () => {
    useEquipmentByIdsMock.mockReturnValue({
      data: new Map([
        ['eq-1', { id: 'eq-1', serial_number: 'SN-42', model: 'ModelZ' }],
      ]),
    });
    render(
      <TechnicalOrderItemsTable
        items={[makeItem({ intended_equipment_id: 'eq-1' })]}
      />,
      { wrapper: makeWrapper() },
    );
    expect(screen.getByText('SN-42')).toBeInTheDocument();
    expect(screen.queryByText('eq-1')).not.toBeInTheDocument();
  });

  it('resolves assignee full_name via useStaffByIds', () => {
    useStaffByIdsMock.mockReturnValue({
      data: new Map([['staff-1', { id: 'staff-1', full_name: 'Perez, Ana' }]]),
    });
    render(
      <TechnicalOrderItemsTable
        items={[makeItem({ intended_assignee_staff_id: 'staff-1' })]}
      />,
      { wrapper: makeWrapper() },
    );
    expect(screen.getByText('Perez, Ana')).toBeInTheDocument();
    expect(screen.queryByText('staff-1')).not.toBeInTheDocument();
  });
});
