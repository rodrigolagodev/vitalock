import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';

const mockRequestDisable = vi.fn();
const mockCancelDisable = vi.fn();

vi.mock('@/hooks/useMutateKey', () => ({
  useMutateKey: () => ({
    changeStatus: { mutateAsync: vi.fn(), isPending: false },
    requestDisable: { mutateAsync: mockRequestDisable, isPending: false },
    cancelDisable: { mutateAsync: mockCancelDisable, isPending: false },
  }),
}));

vi.mock('@vitalock/shared', () => ({
  useAuthContext: () => ({ staff: { id: 'staff-1' } }),
}));

import { KeyStatusChangeDialog } from '../KeyStatusChangeDialog';
import type { KeyRow } from '@/hooks/useKeys';

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

const activeKey: KeyRow = {
  id: 'k-1',
  rfid_code: 'K-0001',
  status: 'active',
  notes: null,
  activated_at: '2026-07-01T10:00:00Z',
  deactivated_at: null,
  picked_up_at: null,
  picked_up_by_name: null,
  picked_up_by_surname: null,
  picked_up_by_dni: null,
  delivered_by_staff_id: null,
  unit_id: 'u-1',
  unit: { id: 'u-1', number: '1A', unit_type: null, is_administrative: false, status: 'active' },
};

const pendingDisableKey: KeyRow = {
  ...activeKey,
  id: 'k-2',
  rfid_code: 'K-0002',
  status: 'pending_disable',
};

describe('KeyStatusChangeDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows "Solicitar baja" action when key status is active', () => {
    render(
      <KeyStatusChangeDialog
        open
        onOpenChange={vi.fn()}
        buildingId="b-1"
        keyRow={activeKey}
      />,
      { wrapper: makeWrapper() },
    );

    expect(screen.getByRole('heading', { name: 'Solicitar baja' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Solicitar baja' })).toBeInTheDocument();
  });

  it('shows "Cancelar baja" action when key status is pending_disable', () => {
    render(
      <KeyStatusChangeDialog
        open
        onOpenChange={vi.fn()}
        buildingId="b-1"
        keyRow={pendingDisableKey}
      />,
      { wrapper: makeWrapper() },
    );

    expect(screen.getByRole('heading', { name: 'Cancelar baja' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar baja' })).toBeInTheDocument();
  });

  it('calls requestDisable when confirming on active key', async () => {
    mockRequestDisable.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(
      <KeyStatusChangeDialog
        open
        onOpenChange={onOpenChange}
        buildingId="b-1"
        keyRow={activeKey}
      />,
      { wrapper: makeWrapper() },
    );

    await user.click(screen.getByRole('button', { name: 'Solicitar baja' }));

    expect(mockRequestDisable).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'k-1', actor_staff_id: 'staff-1' }),
    );
  });

  it('calls cancelDisable when confirming on pending_disable key', async () => {
    mockCancelDisable.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();

    render(
      <KeyStatusChangeDialog
        open
        onOpenChange={vi.fn()}
        buildingId="b-1"
        keyRow={pendingDisableKey}
      />,
      { wrapper: makeWrapper() },
    );

    await user.click(screen.getByRole('button', { name: 'Cancelar baja' }));

    expect(mockCancelDisable).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'k-2', actor_staff_id: 'staff-1' }),
    );
  });
});
