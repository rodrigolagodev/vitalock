import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';

const mockDeactivateMutate = vi.fn();

vi.mock('@/hooks/useMutateUnit', () => ({
  useMutateUnit: () => ({
    createUnit: vi.fn(),
    updateUnit: vi.fn(),
    deactivateUnit: {
      mutate: mockDeactivateMutate,
      isPending: false,
    },
  }),
}));

import { UnitsTable } from '../UnitsTable';
import type { UnitRow } from '@/hooks/useUnits';

const unitActiva: UnitRow = {
  id: 'u-1',
  number: '1A',
  unit_type: 'apartment',
  status: 'active',
  is_administrative: true,
  building_id: 'b-1',
};

const unitInactiva: UnitRow = {
  id: 'u-2',
  number: '2B',
  unit_type: null,
  status: 'inactive',
  is_administrative: false,
  building_id: 'b-1',
};

function makeUnits(count: number): UnitRow[] {
  return Array.from({ length: count }, (_, i) => ({
    ...unitActiva,
    id: `u-${i + 1}`,
    number: `${i + 1}A`,
  }));
}

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe('UnitsTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders rows with status and administrative badges', () => {
    render(<UnitsTable buildingId="b-1" units={[unitActiva, unitInactiva]} />, {
      wrapper: makeWrapper(),
    });

    expect(screen.getByText('1A')).toBeInTheDocument();
    expect(screen.getByText('Activa')).toBeInTheDocument();
    expect(screen.getByText('Sí')).toBeInTheDocument();
    expect(screen.getByText('2B')).toBeInTheDocument();
    expect(screen.getByText('Inactiva')).toBeInTheDocument();
    expect(screen.getByText('No')).toBeInTheDocument();
  });

  it('renders the loading skeleton while fetching', () => {
    render(<UnitsTable buildingId="b-1" units={[]} isFetching />, {
      wrapper: makeWrapper(),
    });

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('Número')).toBeInTheDocument();
  });

  it('shows the empty state when there are no units', () => {
    render(<UnitsTable buildingId="b-1" units={[]} />, { wrapper: makeWrapper() });

    expect(screen.getByText('No hay unidades registradas.')).toBeInTheDocument();
  });

  it('opens the edit sheet with the unit name in the action label', async () => {
    const user = userEvent.setup();
    render(<UnitsTable buildingId="b-1" units={[unitActiva]} />, { wrapper: makeWrapper() });

    await user.click(screen.getByRole('button', { name: 'Editar a 1A' }));

    expect(await screen.findByText('Editar unidad')).toBeInTheDocument();
  });

  it('deactivates only active units and calls the mutation with building id', async () => {
    const user = userEvent.setup();
    render(<UnitsTable buildingId="b-1" units={[unitActiva, unitInactiva]} />, {
      wrapper: makeWrapper(),
    });

    expect(screen.getByRole('button', { name: 'Desactivar 1A' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Desactivar 2B' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Desactivar 1A' }));

    expect(mockDeactivateMutate).toHaveBeenCalledWith({ id: 'u-1', building_id: 'b-1' });
  });

  it('renders the pagination footer and only the first 10 rows', () => {
    render(<UnitsTable buildingId="b-1" units={makeUnits(12)} />, { wrapper: makeWrapper() });

    expect(screen.getByText('1–10 de 12')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(11); // 1 header + 10 body rows
  });
});
