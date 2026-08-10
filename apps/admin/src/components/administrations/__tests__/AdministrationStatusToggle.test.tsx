import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';
import type { BuildingRow } from '@/hooks/useBuildings';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const mockDeactivateMutateAsync = vi.fn();
const mockDeactivateIsPending = vi.fn(() => false);

vi.mock('@/hooks/useMutateAdministration', () => ({
  useMutateAdministration: () => ({
    createAdministration: {},
    updateAdministration: {},
    deactivateAdministration: {
      mutateAsync: mockDeactivateMutateAsync,
      isPending: mockDeactivateIsPending(),
    },
  }),
}));

let mockBuildings: BuildingRow[] = [];

vi.mock('@/hooks/useBuildings', () => ({
  useBuildings: () => ({ data: mockBuildings }),
}));

import { AdministrationStatusToggle } from '../AdministrationStatusToggle';

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

const activeAdmin = {
  id: 'a-1',
  company_name: 'Garcia S.A.',
  status: 'active',
};

const inactiveAdmin = {
  id: 'a-2',
  company_name: 'Lopez S.R.L.',
  status: 'inactive',
};

const makeBuilding = (id: string, status: string): BuildingRow => ({
  id,
  name: `Edificio ${id}`,
  address: null,
  status,
  administration_id: 'a-1',
  key_count: 0,
  equipment_count: 0,
});

describe('AdministrationStatusToggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuildings = [];
    mockDeactivateMutateAsync.mockResolvedValue({});
  });

  it('renders nothing for inactive administration', () => {
    const { container } = render(
      <AdministrationStatusToggle administration={inactiveAdmin} />,
      { wrapper: makeWrapper() },
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders "Desactivar" button for active administration', () => {
    render(<AdministrationStatusToggle administration={activeAdmin} />, {
      wrapper: makeWrapper(),
    });
    expect(screen.getByRole('button', { name: 'Desactivar' })).toBeInTheDocument();
  });

  it('shows blocking dialog with active buildings count when activeBuildings > 0', async () => {
    mockBuildings = [
      makeBuilding('b-1', 'active'),
      makeBuilding('b-2', 'active'),
    ];

    const user = userEvent.setup();
    render(<AdministrationStatusToggle administration={activeAdmin} />, {
      wrapper: makeWrapper(),
    });

    await user.click(screen.getByRole('button', { name: 'Desactivar' }));

    await waitFor(() => {
      expect(screen.getByText('No se puede desactivar')).toBeInTheDocument();
    });

    // Must display N edificios activos
    expect(screen.getByText(/2 edificios activos/)).toBeInTheDocument();
    expect(mockDeactivateMutateAsync).not.toHaveBeenCalled();
  });

  it('shows blocking dialog even with 1 active building', async () => {
    mockBuildings = [makeBuilding('b-1', 'active')];

    const user = userEvent.setup();
    render(<AdministrationStatusToggle administration={activeAdmin} />, {
      wrapper: makeWrapper(),
    });

    await user.click(screen.getByRole('button', { name: 'Desactivar' }));

    await waitFor(() => {
      expect(screen.getByText('No se puede desactivar')).toBeInTheDocument();
    });

    expect(screen.getByText(/1 edificio activo/)).toBeInTheDocument();
    expect(mockDeactivateMutateAsync).not.toHaveBeenCalled();
  });

  it('shows only "Entendido" button (no delete) in block dialog', async () => {
    mockBuildings = [makeBuilding('b-1', 'active')];

    const user = userEvent.setup();
    render(<AdministrationStatusToggle administration={activeAdmin} />, {
      wrapper: makeWrapper(),
    });

    await user.click(screen.getByRole('button', { name: 'Desactivar' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Entendido' })).toBeInTheDocument();
    });

    // No destructive "Desactivar" confirm button visible
    const buttons = screen.getAllByRole('button');
    const destructiveBtn = buttons.find(
      (b) => b.textContent === 'Desactivar' && b.getAttribute('data-variant') === 'destructive',
    );
    expect(destructiveBtn).toBeUndefined();
  });

  it('allows deactivation when no active buildings exist', async () => {
    // No buildings
    mockBuildings = [];

    const user = userEvent.setup();
    render(<AdministrationStatusToggle administration={activeAdmin} />, {
      wrapper: makeWrapper(),
    });

    await user.click(screen.getByRole('button', { name: 'Desactivar' }));

    await waitFor(() => {
      expect(screen.getByText('Desactivar administración')).toBeInTheDocument();
    });

    // Confirm button appears
    const confirmBtn = screen.getByRole('button', { name: 'Desactivar' });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(mockDeactivateMutateAsync).toHaveBeenCalledWith({ id: 'a-1' });
    });
  });

  it('ignores inactive buildings when counting active ones', async () => {
    // Only inactive buildings — should NOT block
    mockBuildings = [makeBuilding('b-1', 'inactive'), makeBuilding('b-2', 'inactive')];

    const user = userEvent.setup();
    render(<AdministrationStatusToggle administration={activeAdmin} />, {
      wrapper: makeWrapper(),
    });

    await user.click(screen.getByRole('button', { name: 'Desactivar' }));

    await waitFor(() => {
      expect(screen.getByText('Desactivar administración')).toBeInTheDocument();
    });

    // Should show confirm dialog, not block dialog
    expect(screen.queryByText('No se puede desactivar')).not.toBeInTheDocument();
  });
});
