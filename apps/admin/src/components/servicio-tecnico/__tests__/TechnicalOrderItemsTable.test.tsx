import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
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
    item_type: 'maintain_equipment',
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
    render(<TechnicalOrderItemsTable items={items} />, { wrapper: makeWrapper() });
    const rows = screen.getAllByRole('row');
    // header row + 2 data rows
    expect(rows.length).toBeGreaterThanOrEqual(3);
  });

  it('shows empty state when no items', () => {
    render(<TechnicalOrderItemsTable items={[]} />, { wrapper: makeWrapper() });
    expect(screen.getByText(/sin ítems/i)).toBeInTheDocument();
  });
});

describe('TechnicalOrderItemsTable — item_type badge', () => {
  it('renders badge for maintenance item type', () => {
    render(<TechnicalOrderItemsTable items={[makeItem({ item_type: 'maintain_equipment' })]} />, {
      wrapper: makeWrapper(),
    });
    expect(screen.getByText(/mantenimiento/i)).toBeInTheDocument();
  });

  it('renders badge for installation item type', () => {
    render(<TechnicalOrderItemsTable items={[makeItem({ item_type: 'install_equipment' })]} />, {
      wrapper: makeWrapper(),
    });
    expect(screen.getByText(/instalación/i)).toBeInTheDocument();
  });

  it('renders badge for equipment_replacement item type', () => {
    render(<TechnicalOrderItemsTable items={[makeItem({ item_type: 'replace_equipment' })]} />, {
      wrapper: makeWrapper(),
    });
    expect(screen.getByText('Reemplazo de equipo')).toBeInTheDocument();
  });
});

describe('TechnicalOrderItemsTable — status badge', () => {
  it('shows Pendiente badge for pending status', () => {
    render(<TechnicalOrderItemsTable items={[makeItem({ status: 'pending' })]} />, {
      wrapper: makeWrapper(),
    });
    expect(screen.getByText('Pendiente')).toBeInTheDocument();
  });

  it('shows En proceso badge for in_progress status', () => {
    render(<TechnicalOrderItemsTable items={[makeItem({ status: 'in_progress' })]} />, {
      wrapper: makeWrapper(),
    });
    expect(screen.getByText('En proceso')).toBeInTheDocument();
  });

  it('shows Completado badge for completed status', () => {
    render(<TechnicalOrderItemsTable items={[makeItem({ status: 'completed' })]} />, {
      wrapper: makeWrapper(),
    });
    expect(screen.getByText('Completado')).toBeInTheDocument();
  });
});

describe('TechnicalOrderItemsTable — intent fields (fallback UUID)', () => {
  it('renders intended_equipment_id UUID when Map does not resolve it', () => {
    useEquipmentByIdsMock.mockReturnValue({ data: new Map() });
    render(
      <TechnicalOrderItemsTable items={[makeItem({ intended_equipment_id: 'eq-uuid-123' })]} />,
      { wrapper: makeWrapper() },
    );
    expect(screen.getByText('eq-uuid-123')).toBeInTheDocument();
  });

  it('renders dash when intended_equipment_id is null', () => {
    render(<TechnicalOrderItemsTable items={[makeItem({ intended_equipment_id: null })]} />, {
      wrapper: makeWrapper(),
    });
    // At least one dash rendered (both fields can be null)
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1);
  });
});

describe('TechnicalOrderItemsTable — responsive column hiding', () => {
  it('hides Descripción below lg, keeps Tipo/Cant./Estado always visible', () => {
    render(<TechnicalOrderItemsTable items={[makeItem()]} />, { wrapper: makeWrapper() });

    expect(screen.getByRole('columnheader', { name: 'Descripción' }).className).toContain(
      'lg:table-cell',
    );
    expect(screen.getByRole('columnheader', { name: 'Equipo previsto' }).className).toContain(
      'lg:table-cell',
    );
    expect(screen.getByRole('columnheader', { name: 'Asignado a' }).className).toContain(
      'lg:table-cell',
    );
    expect(screen.getByRole('columnheader', { name: 'Tipo' }).className).not.toContain('hidden');
    expect(screen.getByRole('columnheader', { name: 'Cant.' }).className).not.toContain('hidden');
    expect(screen.getByRole('columnheader', { name: 'Estado' }).className).not.toContain('hidden');
  });
});

describe('TechnicalOrderItemsTable — intent fields (resolved names)', () => {
  it('resolves equipment serial_number via useEquipmentByIds', () => {
    useEquipmentByIdsMock.mockReturnValue({
      data: new Map([['eq-1', { id: 'eq-1', serial_number: 'SN-42', model: 'ModelZ' }]]),
    });
    render(<TechnicalOrderItemsTable items={[makeItem({ intended_equipment_id: 'eq-1' })]} />, {
      wrapper: makeWrapper(),
    });
    expect(screen.getByText('SN-42')).toBeInTheDocument();
    expect(screen.queryByText('eq-1')).not.toBeInTheDocument();
  });

  it('resolves assignee full_name via useStaffByIds', () => {
    useStaffByIdsMock.mockReturnValue({
      data: new Map([['staff-1', { id: 'staff-1', full_name: 'Perez, Ana' }]]),
    });
    render(
      <TechnicalOrderItemsTable items={[makeItem({ intended_assignee_staff_id: 'staff-1' })]} />,
      { wrapper: makeWrapper() },
    );
    expect(screen.getByText('Perez, Ana')).toBeInTheDocument();
    expect(screen.queryByText('staff-1')).not.toBeInTheDocument();
  });
});

describe('TechnicalOrderItemsTable — price, subtotal and footer total', () => {
  it('shows Precio and Subtotal columns with the footer total', () => {
    render(
      <TechnicalOrderItemsTable
        items={[makeItem({ item_type: 'install_equipment', unit_price: 80 })]}
      />,
      { wrapper: makeWrapper() },
    );

    expect(screen.getByRole('columnheader', { name: 'Precio' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Subtotal' })).toBeInTheDocument();
    // Precio and Subtotal both render $ 80,00 for a quantity of 1
    expect(screen.getAllByText('$ 80,00')).toHaveLength(2);
    expect(screen.getByText('Total: $ 80,00')).toBeInTheDocument();
  });

  it('shows $ 0,00 for a zero-price maintenance item and a zero total', () => {
    render(<TechnicalOrderItemsTable items={[makeItem({ unit_price: 0 })]} />, {
      wrapper: makeWrapper(),
    });

    expect(screen.getAllByText('$ 0,00')).toHaveLength(2); // Precio and Subtotal
    expect(screen.getByText('Total: $ 0,00')).toBeInTheDocument();
  });

  it('shows a cancelled row but leaves it out of the footer total', () => {
    render(
      <TechnicalOrderItemsTable
        items={[
          makeItem({ id: 'a', item_type: 'install_equipment', unit_price: 100, status: 'pending' }),
          makeItem({ id: 'b', unit_price: 40, status: 'cancelled' }),
        ]}
      />,
      { wrapper: makeWrapper() },
    );

    expect(screen.getAllByText('$ 40,00')).toHaveLength(2);
    expect(screen.getByText('Total: $ 100,00')).toBeInTheDocument();
  });

  it('keeps the footer total visible on every page', async () => {
    const user = userEvent.setup();
    const items = Array.from({ length: 25 }, (_, i) =>
      makeItem({ id: `item-${i}`, unit_price: 10 }),
    );
    render(<TechnicalOrderItemsTable items={items} />, { wrapper: makeWrapper() });

    expect(screen.getByText('Total: $ 250,00')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Página siguiente' }));
    expect(screen.getByText('11–20 de 25')).toBeInTheDocument();
    expect(screen.getByText('Total: $ 250,00')).toBeInTheDocument();
  });
});
