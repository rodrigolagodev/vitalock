import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';

vi.mock('@/hooks/useMutateEquipment', () => ({
  useMutateEquipment: () => ({
    createEquipment: vi.fn(),
    updateEquipment: vi.fn(),
    updateStatus: vi.fn(),
  }),
}));

vi.mock('@/hooks/useReplaceEquipment', () => ({
  useReplaceEquipment: () => ({ replaceEquipment: vi.fn() }),
}));

vi.mock('@/hooks/useDecommissionImpact', () => ({
  useDecommissionImpact: () => ({ data: 0, isFetching: false }),
}));

import { EquipmentTable } from '../EquipmentTable';
import type { EquipmentRow } from '@/hooks/useEquipment';

const equipoActivo: EquipmentRow = {
  id: 'e-1',
  model: 'Lector X1',
  serial_number: 'SN-0001',
  status: 'active',
  installed_at: '2026-07-01T10:00:00Z',
  building_id: 'b-1',
};

const equipoMantenimiento: EquipmentRow = {
  id: 'e-2',
  model: 'Lector Y2',
  serial_number: 'SN-0002',
  status: 'maintenance',
  installed_at: '2026-07-01T10:00:00Z',
  building_id: 'b-1',
};

const equipoDadoDeBaja: EquipmentRow = {
  id: 'e-3',
  model: null,
  serial_number: 'SN-0003',
  status: 'dead',
  installed_at: '',
  building_id: 'b-1',
};

function makeEquipment(count: number): EquipmentRow[] {
  return Array.from({ length: count }, (_, i) => ({
    ...equipoActivo,
    id: `e-${i + 1}`,
    serial_number: `SN-${String(i + 1).padStart(4, '0')}`,
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

describe('EquipmentTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders rows with status labels and missing-model dash', () => {
    render(
      <EquipmentTable buildingId="b-1" equipment={[equipoActivo, equipoMantenimiento, equipoDadoDeBaja]} />,
      { wrapper: makeWrapper() },
    );

    expect(screen.getByText('Lector X1')).toBeInTheDocument();
    expect(screen.getByText('SN-0001')).toBeInTheDocument();
    expect(screen.getByText('Activo')).toBeInTheDocument();
    expect(screen.getByText('Mantenimiento')).toBeInTheDocument();
    expect(screen.getByText('Dado de baja')).toBeInTheDocument();
    expect(screen.getAllByText('—')).toHaveLength(2); // model + installed_at
  });

  it('renders the loading skeleton while fetching', () => {
    render(<EquipmentTable buildingId="b-1" equipment={[]} isFetching />, {
      wrapper: makeWrapper(),
    });

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('Modelo')).toBeInTheDocument();
  });

  it('shows the empty state when there is no equipment', () => {
    render(<EquipmentTable buildingId="b-1" equipment={[]} />, { wrapper: makeWrapper() });

    expect(screen.getByText('No hay equipos registrados.')).toBeInTheDocument();
  });

  it('opens the edit sheet with the item name in the action label', async () => {
    const user = userEvent.setup();
    render(<EquipmentTable buildingId="b-1" equipment={[equipoActivo]} />, {
      wrapper: makeWrapper(),
    });

    await user.click(screen.getByRole('button', { name: 'Editar a Lector X1' }));

    expect(await screen.findByText('Editar equipo')).toBeInTheDocument();
  });

  it('offers Reemplazar only for non-dead equipment and opens the dialog', async () => {
    const user = userEvent.setup();
    render(
      <EquipmentTable
        buildingId="b-1"
        equipment={[equipoActivo, equipoDadoDeBaja]}
      />,
      { wrapper: makeWrapper() },
    );

    expect(screen.getByRole('button', { name: 'Reemplazar Lector X1' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reemplazar sn-0003/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reemplazar Lector X1' }));

    expect(await screen.findByRole('heading', { name: 'Reemplazar equipo' })).toBeInTheDocument();
  });

  it('renders the pagination footer and only the first 10 rows', () => {
    render(<EquipmentTable buildingId="b-1" equipment={makeEquipment(12)} />, {
      wrapper: makeWrapper(),
    });

    expect(screen.getByText('1–10 de 12')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(11); // 1 header + 10 body rows
  });
});
