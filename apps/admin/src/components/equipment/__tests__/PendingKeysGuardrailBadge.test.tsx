import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

import { PendingKeysGuardrailBadge } from '../PendingKeysGuardrailBadge';
import type { KeyRow } from '@/hooks/useKeys';
import type { EquipmentUpdateRow } from '@/hooks/useEquipmentUpdates';

function makeKey(id: string, status: KeyRow['status']): KeyRow {
  return {
    id,
    rfid_code: `K-${id}`,
    status,
    notes: null,
    activated_at: '2026-07-01T10:00:00Z',
    deactivated_at: null,
    picked_up_at: null,
    picked_up_by_name: null,
    picked_up_by_surname: null,
    picked_up_by_dni: null,
    delivered_by_staff_id: null,
    unit_id: `u-${id}`,
    unit: {
      id: `u-${id}`,
      number: `${id}A`,
      unit_type: null,
      is_administrative: false,
      status: 'active',
    },
  };
}

function makeUpdate(
  id: string,
  status: EquipmentUpdateRow['ticket_status'],
  keysToActivate: string[],
  keysToDisable: string[],
): EquipmentUpdateRow {
  return {
    id,
    ticket_id: `ticket-${id}`,
    equipment_id: 'equip-1',
    mdb_storage_path: `ticket-${id}/db.mdb`,
    keys_to_activate: keysToActivate,
    keys_to_disable: keysToDisable,
    created_at: '2026-08-01T10:00:00Z',
    created_by_staff_id: null,
    resolved_at: null,
    resolved_by_staff_id: null,
    ticket_status: status,
  };
}

describe('PendingKeysGuardrailBadge', () => {
  it('renders badge with count when one pending_installation key is outside active train', () => {
    const keys: KeyRow[] = [makeKey('1', 'pending_installation')];
    const updates: EquipmentUpdateRow[] = [];

    render(<PendingKeysGuardrailBadge keys={keys} equipmentUpdates={updates} />, {
      wrapper: makeWrapper(),
    });

    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('hides badge when all pending keys are covered by an active (open) train', () => {
    const keys: KeyRow[] = [makeKey('1', 'pending_installation'), makeKey('2', 'pending_disable')];
    const updates: EquipmentUpdateRow[] = [makeUpdate('u1', 'open', ['1'], ['2'])];

    render(<PendingKeysGuardrailBadge keys={keys} equipmentUpdates={updates} />, {
      wrapper: makeWrapper(),
    });

    expect(screen.queryByText('1')).not.toBeInTheDocument();
    expect(screen.queryByText('2')).not.toBeInTheDocument();
  });

  it('hides badge when no pending keys exist', () => {
    const keys: KeyRow[] = [makeKey('1', 'active'), makeKey('2', 'disabled')];
    const updates: EquipmentUpdateRow[] = [];

    render(<PendingKeysGuardrailBadge keys={keys} equipmentUpdates={updates} />, {
      wrapper: makeWrapper(),
    });

    expect(screen.queryByRole('generic', { name: /\d+/ })).not.toBeInTheDocument();
  });

  it('counts keys covered by in_progress train as already handled', () => {
    const keys: KeyRow[] = [
      makeKey('1', 'pending_installation'),
      makeKey('2', 'pending_disable'),
      makeKey('3', 'pending_installation'),
    ];
    const updates: EquipmentUpdateRow[] = [makeUpdate('u1', 'in_progress', ['1'], ['2'])];

    render(<PendingKeysGuardrailBadge keys={keys} equipmentUpdates={updates} />, {
      wrapper: makeWrapper(),
    });

    expect(screen.getByText('1')).toBeInTheDocument();
  });
});
