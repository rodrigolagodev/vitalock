import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';
import type { UnitRow } from '@/hooks/useUnits';
import type { EquipmentRow } from '@/hooks/useEquipment';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

// Mock hooks
const mockDeactivateMutateAsync = vi.fn();
const mockDeactivateIsPending = vi.fn(() => false);

vi.mock('@/hooks/useMutateBuilding', () => ({
  useMutateBuilding: () => ({
    createBuilding: {},
    updateBuilding: {},
    deactivateBuilding: {
      mutateAsync: mockDeactivateMutateAsync,
      isPending: mockDeactivateIsPending(),
    },
  }),
}));

let mockUnits: UnitRow[] = [];
let mockEquipment: EquipmentRow[] = [];

vi.mock('@/hooks/useUnits', () => ({
  useUnits: () => ({ data: mockUnits }),
}));

vi.mock('@/hooks/useEquipment', () => ({
  useEquipment: () => ({ data: mockEquipment }),
}));

import { BuildingStatusToggle } from '../BuildingStatusToggle';

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

const activeBuilding = { id: 'b-1', name: 'Torre Norte', status: 'active' };
const inactiveBuilding = { id: 'b-2', name: 'Torre Sur', status: 'inactive' };

describe('BuildingStatusToggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUnits = [];
    mockEquipment = [];
    mockDeactivateMutateAsync.mockResolvedValue({});
  });

  it('renders nothing for inactive building', () => {
    const { container } = render(
      <BuildingStatusToggle building={inactiveBuilding} />,
      { wrapper: makeWrapper() },
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders "Desactivar" button for active building', () => {
    render(<BuildingStatusToggle building={activeBuilding} />, {
      wrapper: makeWrapper(),
    });
    expect(screen.getByRole('button', { name: 'Desactivar' })).toBeInTheDocument();
  });

  it('shows block dialog when activeUnits > 0', async () => {
    mockUnits = [
      { id: 'u-1', number: '101', status: 'active', is_administrative: false, building_id: 'b-1' },
    ];

    const user = userEvent.setup();
    render(<BuildingStatusToggle building={activeBuilding} />, {
      wrapper: makeWrapper(),
    });

    await user.click(screen.getByRole('button', { name: 'Desactivar' }));

    await waitFor(() => {
      expect(screen.getByText('No se puede desactivar')).toBeInTheDocument();
    });
    expect(screen.getByText(/1 unidad activa/)).toBeInTheDocument();
    expect(mockDeactivateMutateAsync).not.toHaveBeenCalled();
  });

  it('shows block dialog when activeEquipment > 0', async () => {
    mockEquipment = [
      {
        id: 'e-1',
        model: 'Controladora',
        serial_number: 'SN001',
        status: 'active',
        installed_at: '2026-01-01',
        building_id: 'b-1',
      },
    ];

    const user = userEvent.setup();
    render(<BuildingStatusToggle building={activeBuilding} />, {
      wrapper: makeWrapper(),
    });

    await user.click(screen.getByRole('button', { name: 'Desactivar' }));

    await waitFor(() => {
      expect(screen.getByText('No se puede desactivar')).toBeInTheDocument();
    });
    expect(screen.getByText(/1 equipo activo/)).toBeInTheDocument();
    expect(mockDeactivateMutateAsync).not.toHaveBeenCalled();
  });

  it('calls deactivateBuilding when activeUnits === 0 && activeEquipment === 0', async () => {
    // Both hooks return empty arrays (no active children)
    mockUnits = [];
    mockEquipment = [];

    const user = userEvent.setup();
    render(<BuildingStatusToggle building={activeBuilding} />, {
      wrapper: makeWrapper(),
    });

    await user.click(screen.getByRole('button', { name: 'Desactivar' }));

    await waitFor(() => {
      expect(screen.getByText('Desactivar edificio')).toBeInTheDocument();
    });

    // Confirm button should be present
    const confirmBtn = screen.getByRole('button', { name: 'Desactivar' });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(mockDeactivateMutateAsync).toHaveBeenCalledWith({ id: 'b-1' });
    });
  });
});
