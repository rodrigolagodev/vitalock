import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { usePendingMock } = vi.hoisted(() => ({ usePendingMock: vi.fn() }));

vi.mock('@/hooks/usePendingKeysForEquipment', () => ({
  usePendingKeysForEquipment: usePendingMock,
}));
vi.mock('@/hooks/useEquipmentUpdates', () => ({ useEquipmentUpdates: () => ({ data: [] }) }));
vi.mock('@/hooks/useKeys', () => ({ useKeys: () => ({ data: [] }) }));
vi.mock('../EquipmentUpdateFormSheet', () => ({ EquipmentUpdateFormSheet: () => null }));

import { EquipmentKeySnapshotPanel } from '../EquipmentKeySnapshotPanel';

describe('EquipmentKeySnapshotPanel states', () => {
  beforeEach(() => usePendingMock.mockReset());

  it('shows a labelled 3-row skeleton and no spinner while loading', () => {
    usePendingMock.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    const { container } = render(<EquipmentKeySnapshotPanel equipmentId="e-1" />);

    const status = screen.getByRole('status', { name: 'Cargando llaves pendientes' });
    expect(status.querySelectorAll('.animate-pulse')).toHaveLength(3);
    expect(container.querySelector('.animate-spin')).toBeNull();
  });

  it('shows a compact not-found message when the query resolves with no record', () => {
    usePendingMock.mockReturnValue({ data: undefined, isLoading: false, isError: false });
    render(<EquipmentKeySnapshotPanel equipmentId="e-1" />);

    expect(
      screen.getByText('No se encontró información de llaves pendientes.'),
    ).toBeInTheDocument();
  });

  it('shows ErrorState with a retry that refetches once', async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();
    usePendingMock.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch });
    render(<EquipmentKeySnapshotPanel equipmentId="e-1" />);

    expect(
      screen.getByText('No se pudo cargar el estado de llaves pendientes.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('renders the pending keys when loaded', () => {
    usePendingMock.mockReturnValue({
      data: {
        toActivate: [{ id: 'k-1', rfid_code: 'RFID-1', unit_number: '2A' }],
        toDisable: [],
        unchanged: [],
      },
      isLoading: false,
      isError: false,
    });
    render(<EquipmentKeySnapshotPanel equipmentId="e-1" />);

    expect(screen.getByText('RFID-1')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
