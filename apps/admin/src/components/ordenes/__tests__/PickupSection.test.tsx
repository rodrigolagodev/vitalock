import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import type { ReactNode } from 'react';

const mockSetPickup = vi.fn();

vi.mock('@/hooks/useMutateOrden', () => ({
  useMutateOrden: () => ({
    setPickupPerson: { mutate: mockSetPickup, isPending: false },
  }),
}));

const mockUseParticulares = vi.fn();

vi.mock('@/hooks/useParticulares', () => ({
  useParticulares: (opts: { search?: string }) => mockUseParticulares(opts),
}));

// Chainable supabase mock — PickupSection resolves a non-buyer pickup person by id.
const mockSingle = vi.fn();
const mockEq = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return { from: mockFrom };
  },
}));

vi.mock('../../particulares/QuickParticularCreateDialog', () => ({
  QuickParticularCreateDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="create-dialog" /> : null,
}));

import { PickupSection } from '../PickupSection';
import type { OrdenDetailRow } from '@/hooks/useOrden';

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(
      MemoryRouter,
      null,
      React.createElement(QueryClientProvider, { client: queryClient }, children),
    );
  };
}

const buyer = {
  id: 'p-1',
  unit_id: 'u-1',
  dni: '30111222',
  full_name: 'García Juan',
  phone: null,
  email: null,
};

const other = {
  id: 'q-1',
  unit_id: 'u-2',
  dni: '33445566',
  full_name: 'Pérez Ana',
  phone: null,
  email: null,
};

function makeOrden(overrides: Partial<OrdenDetailRow> = {}): OrdenDetailRow {
  return {
    id: 'o-1',
    order_number: 'ORD-1',
    client_type: 'particular',
    administration_id: null,
    administrations: null,
    particular_id: 'p-1',
    pickup_particular_id: null,
    particulares: buyer,
    particular_full_name: 'García Juan',
    particular_dni: '30111222',
    particular_phone: null,
    particular_email: null,
    status: 'ready_for_pickup',
    notes: null,
    created_at: '2026-08-10T00:00:00Z',
    order_items: [],
    ...overrides,
  };
}

describe('PickupSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseParticulares.mockReturnValue({ data: [], isFetching: false });
    mockSingle.mockResolvedValue({ data: other, error: null });
    mockEq.mockReturnValue({ single: mockSingle });
    mockSelect.mockReturnValue({ eq: mockEq });
    mockFrom.mockReturnValue({ select: mockSelect });
  });

  it('is not rendered for administration orders', () => {
    render(<PickupSection orden={makeOrden({ client_type: 'administration' })} />, {
      wrapper: makeWrapper(),
    });

    expect(screen.queryByText(/quién retira la llave/i)).not.toBeInTheDocument();
  });

  it('is not rendered for terminal orders', () => {
    render(<PickupSection orden={makeOrden({ status: 'completed' })} />, {
      wrapper: makeWrapper(),
    });

    expect(screen.queryByText(/quién retira la llave/i)).not.toBeInTheDocument();
  });

  it('checkbox reuses the buyer as pickup person', async () => {
    const user = userEvent.setup();
    render(<PickupSection orden={makeOrden()} />, { wrapper: makeWrapper() });

    await user.click(screen.getByRole('checkbox', { name: /usar mismos datos/i }));

    expect(mockSetPickup).toHaveBeenCalledWith({
      id: 'o-1',
      pickup_particular_id: 'p-1',
    });
  });

  it('checkbox is checked when pickup equals buyer and unchecking clears it', async () => {
    const user = userEvent.setup();
    render(
      <PickupSection
        orden={makeOrden({ pickup_particular_id: 'p-1' })}
      />,
      { wrapper: makeWrapper() },
    );

    const checkbox = screen.getByRole('checkbox', { name: /usar mismos datos/i });
    expect(checkbox).toBeChecked();
    // Selector is replaced by the summary when reusing the buyer
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByText(/retira: garcía juan/i)).toBeInTheDocument();

    await user.click(checkbox);
    expect(mockSetPickup).toHaveBeenCalledWith({
      id: 'o-1',
      pickup_particular_id: null,
    });
  });

  it('explicit pick saves the selected particular and leaves the checkbox unchecked', async () => {
    const user = userEvent.setup();
    mockUseParticulares.mockReturnValue({ data: [other], isFetching: false });
    render(<PickupSection orden={makeOrden()} />, { wrapper: makeWrapper() });

    await user.type(screen.getByRole('combobox'), 'perez');
    await user.click(await screen.findByRole('option', { name: /pérez ana/i }));

    expect(mockSetPickup).toHaveBeenCalledWith({
      id: 'o-1',
      pickup_particular_id: 'q-1',
    });
    expect(
      screen.getByRole('checkbox', { name: /usar mismos datos/i }),
    ).not.toBeChecked();
  });

  it('resolves a non-buyer pickup person by id and shows the summary', async () => {
    render(
      <PickupSection orden={makeOrden({ pickup_particular_id: 'q-1' })} />,
      { wrapper: makeWrapper() },
    );

    expect(mockFrom).toHaveBeenCalledWith('particulares');
    expect(await screen.findByText(/retira: pérez ana/i)).toBeInTheDocument();
    expect(screen.getByText(/dni 33445566/i)).toBeInTheDocument();
  });

  it('opens the inline create dialog from the section button', async () => {
    const user = userEvent.setup();
    render(<PickupSection orden={makeOrden()} />, { wrapper: makeWrapper() });

    await user.click(screen.getByRole('button', { name: /crear particular/i }));
    expect(screen.getByTestId('create-dialog')).toBeInTheDocument();
  });
});
