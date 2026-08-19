import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import type { ReactNode } from 'react';
import type { KeyOrderItemRow } from '@/hooks/useKeyOrder';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
// Stub child dialog/sheet components to avoid deep dependency chains
vi.mock('@/components/llaves/ConfigureKeyItemSheet', () => ({
  ConfigureKeyItemSheet: ({ open }: { open: boolean }) =>
    open ? <div>Configurar llave</div> : null,
}));
vi.mock('@/components/llaves/PickupKeyDialog', () => ({
  PickupKeyDialog: () => null,
}));
vi.mock('@/components/llaves/KeyItemDetailsDialog', () => ({
  KeyItemDetailsDialog: () => null,
}));

// No hook mocks needed — child dialogs are fully stubbed above

import { KeyOrderItemsTable } from '../KeyOrderItemsTable';

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

function makeItem(overrides: Partial<KeyOrderItemRow> = {}): KeyOrderItemRow {
  return {
    id: 'item-1',
    order_id: 'ko-1',
    item_type: 'key',
    quantity: 1,
    description: null,
    status: 'pending',
    building_id: 'bld-1',
    unit_id: null,
    unit_price: 100,
    product_id: null,
    produced_key_id: null,
    pickup_particular_id: null,
    pickup_particulares: null,
    rfid_keys: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('KeyOrderItemsTable — row rendering', () => {
  it('renders a row for each item', () => {
    const items = [makeItem({ id: 'item-1' }), makeItem({ id: 'item-2' })];
    render(
      <KeyOrderItemsTable items={items} orderId="ko-1" orderStatus="confirmed" />,
      { wrapper: makeWrapper() },
    );
    // Table should have 2 rows (one per item; DataTable renders tr per row)
    const rows = screen.getAllByRole('row');
    // Header row + 2 data rows
    expect(rows.length).toBeGreaterThanOrEqual(3);
  });

  it('shows "pending" status badge label', () => {
    render(
      <KeyOrderItemsTable items={[makeItem()]} orderId="ko-1" orderStatus="confirmed" />,
      { wrapper: makeWrapper() },
    );
    expect(screen.getByText('Pendiente')).toBeInTheDocument();
  });

  it('shows empty state when no items', () => {
    render(
      <KeyOrderItemsTable items={[]} orderId="ko-1" orderStatus="confirmed" />,
      { wrapper: makeWrapper() },
    );
    expect(screen.getByText(/sin ítems/i)).toBeInTheDocument();
  });
});

describe('KeyOrderItemsTable — configure action', () => {
  it('shows configure button for pending item when order is confirmed', () => {
    render(
      <KeyOrderItemsTable
        items={[makeItem({ status: 'pending' })]}
        orderId="ko-1"
        orderStatus="confirmed"
      />,
      { wrapper: makeWrapper() },
    );
    // Settings2 icon button should be present
    expect(screen.getByRole('button', { name: /configurar/i })).toBeInTheDocument();
  });

  it('hides configure button when item is already configured', () => {
    render(
      <KeyOrderItemsTable
        items={[makeItem({ status: 'configured', produced_key_id: 'rfid-1' })]}
        orderId="ko-1"
        orderStatus="in_progress"
      />,
      { wrapper: makeWrapper() },
    );
    expect(screen.queryByRole('button', { name: /configurar/i })).not.toBeInTheDocument();
  });

  it('hides configure button when order status is draft', () => {
    render(
      <KeyOrderItemsTable
        items={[makeItem({ status: 'pending' })]}
        orderId="ko-1"
        orderStatus="draft"
      />,
      { wrapper: makeWrapper() },
    );
    expect(screen.queryByRole('button', { name: /configurar/i })).not.toBeInTheDocument();
  });

  it('opens configure sheet when configure button clicked', () => {
    render(
      <KeyOrderItemsTable
        items={[makeItem({ status: 'pending' })]}
        orderId="ko-1"
        orderStatus="confirmed"
      />,
      { wrapper: makeWrapper() },
    );
    const configBtn = screen.getByRole('button', { name: /configurar/i });
    fireEvent.click(configBtn);
    // ConfigureKeyItemSheet should open — it renders a SheetTitle
    expect(screen.getByText(/configurar llave/i)).toBeInTheDocument();
  });
});
