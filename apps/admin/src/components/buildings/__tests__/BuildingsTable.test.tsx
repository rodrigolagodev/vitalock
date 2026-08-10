import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import type { ReactNode } from 'react';
import type { BuildingRow } from '@/hooks/useBuildings';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock('@/hooks/useMutateBuilding', () => ({
  useMutateBuilding: () => ({
    createBuilding: { mutateAsync: vi.fn(), isPending: false },
    updateBuilding: { mutateAsync: vi.fn(), isPending: false },
    deactivateBuilding: { mutateAsync: vi.fn(), isPending: false },
  }),
}));

vi.mock('@/hooks/useAdministrations', () => ({
  useAdministrations: () => ({ data: [], isLoading: false }),
}));

vi.mock('@/hooks/useUnits', () => ({
  useUnits: () => ({ data: [] }),
}));

vi.mock('@/hooks/useEquipment', () => ({
  useEquipment: () => ({ data: [] }),
}));

import { BuildingsTable } from '../BuildingsTable';

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(
      MemoryRouter,
      null,
      React.createElement(QueryClientProvider, { client: queryClient }, children),
    );
  };
}

const sampleBuildings: BuildingRow[] = [
  {
    id: 'b-1',
    name: 'Torre Norte',
    address: 'Av. Callao 123',
    status: 'active',
    administration_id: 'adm-1',
    key_count: 5,
    equipment_count: 2,
  },
  {
    id: 'b-2',
    name: 'Torre Sur',
    address: null,
    status: 'inactive',
    administration_id: 'adm-1',
    key_count: 0,
    equipment_count: 0,
  },
];

describe('BuildingsTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders each building name as an anchor link to /buildings/:id', () => {
    render(
      <BuildingsTable buildings={sampleBuildings} />,
      { wrapper: makeWrapper() },
    );

    const link1 = screen.getByRole('link', { name: 'Torre Norte' });
    expect(link1).toBeInTheDocument();
    expect(link1).toHaveAttribute('href', '/buildings/b-1');

    const link2 = screen.getByRole('link', { name: 'Torre Sur' });
    expect(link2).toBeInTheDocument();
    expect(link2).toHaveAttribute('href', '/buildings/b-2');
  });

  it('renders building names as links (not plain text)', () => {
    render(
      <BuildingsTable buildings={sampleBuildings} />,
      { wrapper: makeWrapper() },
    );

    // Ensure the name is wrapped in an <a>, not a bare text node
    const link = screen.getByRole('link', { name: 'Torre Norte' });
    expect(link.tagName).toBe('A');
  });

  it('renders empty state when buildings list is empty', () => {
    render(
      <BuildingsTable buildings={[]} />,
      { wrapper: makeWrapper() },
    );

    expect(screen.getByText(/no hay edificios registrados/i)).toBeInTheDocument();
  });

  it('renders skeleton rows when isFetching is true', () => {
    const { container } = render(
      <BuildingsTable buildings={[]} isFetching={true} />,
      { wrapper: makeWrapper() },
    );

    // Should show skeleton rows (animate-pulse elements), not links
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });
});
