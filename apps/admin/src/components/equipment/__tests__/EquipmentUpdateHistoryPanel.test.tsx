import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import type { ReactNode } from 'react';
import type { EquipmentUpdateHistoryRow } from '@/hooks/useEquipmentUpdateHistory';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const { useEquipmentUpdateHistoryMock, useStaffByIdsMock, useMdbDownloadMock, downloadMock } =
  vi.hoisted(() => ({
    useEquipmentUpdateHistoryMock: vi.fn(),
    useStaffByIdsMock: vi.fn(),
    useMdbDownloadMock: vi.fn(),
    downloadMock: vi.fn(),
  }));

vi.mock('@/hooks/useEquipmentUpdateHistory', () => ({
  useEquipmentUpdateHistory: useEquipmentUpdateHistoryMock,
}));
vi.mock('@/hooks/useStaffByIds', () => ({ useStaffByIds: useStaffByIdsMock }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@vitalock/shared', () => ({ useMdbDownload: useMdbDownloadMock }));

import { EquipmentUpdateHistoryPanel } from '../EquipmentUpdateHistoryPanel';

const rowUno: EquipmentUpdateHistoryRow = {
  id: 'u-1',
  created_at: '2026-08-10T12:00:00Z',
  resolved_at: '2026-08-10T12:05:00Z',
  resolved_by_staff_id: 's-1',
  mdb_storage_path: 'equipment-updates-mdb/eq-1/v1.mdb',
  keys_to_activate: ['k1', 'k2'],
  keys_to_disable: ['k3'],
};

const rowDos: EquipmentUpdateHistoryRow = {
  id: 'u-2',
  created_at: '2026-07-01T09:00:00Z',
  resolved_at: '2026-07-01T09:05:00Z',
  resolved_by_staff_id: null,
  mdb_storage_path: 'equipment-updates-mdb/eq-1/v2.mdb',
  keys_to_activate: [],
  keys_to_disable: [],
};

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(
      MemoryRouter,
      null,
      React.createElement(QueryClientProvider, { client: queryClient }, children),
    );
  };
}

describe('EquipmentUpdateHistoryPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useEquipmentUpdateHistoryMock.mockReturnValue({ data: [rowUno, rowDos], isFetching: false });
    useStaffByIdsMock.mockReturnValue({
      data: new Map([['s-1', { id: 's-1', full_name: 'Ana Gómez' }]]),
    });
    useMdbDownloadMock.mockReturnValue({ download: downloadMock, downloadingId: null });
  });

  it('renders one flat card per update, not a table and not grouped', () => {
    const { container } = render(<EquipmentUpdateHistoryPanel equipmentId="eq-1" />, {
      wrapper: makeWrapper(),
    });

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    // No SectionHeading group — a handful of rows per equipment doesn't
    // warrant a grouping header (see component doc comment).
    expect(container.querySelectorAll('section')).toHaveLength(0);
  });

  it('shows resolved-by staff name and key activation/deactivation counts', () => {
    render(<EquipmentUpdateHistoryPanel equipmentId="eq-1" />, { wrapper: makeWrapper() });

    expect(screen.getByText('Ana Gómez')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument(); // rowDos has no resolver
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('triggers the MDB download for the correct row when its action is clicked', async () => {
    const user = userEvent.setup();
    render(<EquipmentUpdateHistoryPanel equipmentId="eq-1" />, { wrapper: makeWrapper() });

    const [button] = screen.getAllByRole('button', { name: /\.mdb/i });
    await user.click(button!);

    expect(downloadMock).toHaveBeenCalledWith(rowUno.mdb_storage_path, rowUno.id);
  });

  it('disables the download action for the row currently downloading', () => {
    useMdbDownloadMock.mockReturnValue({ download: downloadMock, downloadingId: rowUno.id });
    render(<EquipmentUpdateHistoryPanel equipmentId="eq-1" />, { wrapper: makeWrapper() });

    expect(screen.getByRole('button', { name: /generando/i })).toBeDisabled();
  });

  it('shows the empty state when there are no updates', () => {
    useEquipmentUpdateHistoryMock.mockReturnValue({ data: [], isFetching: false });
    render(<EquipmentUpdateHistoryPanel equipmentId="eq-1" />, { wrapper: makeWrapper() });

    expect(screen.getByText('No hay actualizaciones de firmware registradas.')).toBeInTheDocument();
  });
});
