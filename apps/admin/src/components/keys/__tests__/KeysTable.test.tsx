import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import React from 'react';
import type { ReactNode } from 'react';

const mockChangeStatus = vi.fn();
const mockRequestDisable = vi.fn();
const mockCancelDisable = vi.fn();

vi.mock('@/hooks/useMutateKey', () => ({
  useMutateKey: () => ({
    changeStatus: { mutateAsync: mockChangeStatus, isPending: false },
    requestDisable: { mutateAsync: mockRequestDisable, isPending: false },
    cancelDisable: { mutateAsync: mockCancelDisable, isPending: false },
  }),
}));

vi.mock('@vitalock/shared', () => ({
  useAuthContext: () => ({ staff: [] }),
}));

import { KeysTable } from '../KeysTable';
import type { KeyRow } from '@/hooks/useKeys';

const keyActiva: KeyRow = {
  id: 'k-1',
  rfid_code: 'K-0001',
  status: 'active',
  notes: null,
  activated_at: '2026-07-01T10:00:00Z',
  deactivated_at: null,
  picked_up_at: null,
  picked_up_by_name: 'Ana',
  picked_up_by_surname: 'Gómez',
  picked_up_by_dni: null,
  delivered_by_staff_id: null,
  unit_id: 'u-1',
  unit: {
    id: 'u-1',
    number: '1A',
    unit_type: 'apartment',
    is_administrative: true,
    status: 'active',
  },
};

const keyDadaDeBaja: KeyRow = {
  id: 'k-2',
  rfid_code: 'K-0002',
  status: 'disabled',
  notes: null,
  activated_at: '2026-07-01T10:00:00Z',
  deactivated_at: '2026-07-10T10:00:00Z',
  picked_up_at: null,
  picked_up_by_name: null,
  picked_up_by_surname: null,
  picked_up_by_dni: null,
  delivered_by_staff_id: null,
  unit_id: 'u-2',
  unit: {
    id: 'u-2',
    number: '2B',
    unit_type: 'apartment',
    is_administrative: false,
    status: 'active',
  },
};

function makeKeys(count: number): KeyRow[] {
  return Array.from({ length: count }, (_, i) => ({
    ...keyActiva,
    id: `k-${i + 1}`,
    rfid_code: `K-${String(i + 1).padStart(4, '0')}`,
    unit: { ...keyActiva.unit, number: `${i + 1}A` },
  }));
}

function makeWrapper(initialEntries: string[] = ['/']) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(
        MemoryRouter,
        { initialEntries },
        React.createElement(
          Routes,
          null,
          React.createElement(Route, { path: '/', element: children }),
          React.createElement(Route, {
            path: '/llaves/inventario/:keyId',
            element: React.createElement('div', null, 'DETAIL_PAGE'),
          }),
        ),
      ),
    );
  };
}

describe('KeysTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders rows with unit info, status label and pickup name', () => {
    render(<KeysTable buildingId="b-1" keys={[keyActiva, keyDadaDeBaja]} />, {
      wrapper: makeWrapper(),
    });

    expect(screen.getByText('K-0001')).toBeInTheDocument();
    expect(screen.getByText('1A')).toBeInTheDocument();
    // both fixture keys share the unit type
    expect(screen.getAllByText(/apartment/)).toHaveLength(2);
    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.getByText('Activa')).toBeInTheDocument();
    expect(screen.getByText('Ana Gómez')).toBeInTheDocument();
    expect(screen.getByText('Dada de baja')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('navigates to the key detail page when the first-cell button is clicked', async () => {
    const user = userEvent.setup();
    render(<KeysTable buildingId="b-1" keys={[keyActiva]} />, { wrapper: makeWrapper() });

    await user.click(screen.getByRole('button', { name: 'K-0001' }));

    expect(await screen.findByText('DETAIL_PAGE')).toBeInTheDocument();
  });

  it('labels the power action "Solicitar baja de" for active keys and opens the status dialog', async () => {
    const user = userEvent.setup();
    render(<KeysTable buildingId="b-1" keys={[keyActiva]} />, { wrapper: makeWrapper() });

    await user.click(screen.getByRole('button', { name: 'Solicitar baja de K-0001' }));
    expect(await screen.findByRole('heading', { name: 'Solicitar baja' })).toBeInTheDocument();
  });

  it('does not show the status-change action button for terminal disabled keys', () => {
    render(<KeysTable buildingId="b-1" keys={[keyDadaDeBaja]} />, { wrapper: makeWrapper() });

    expect(screen.queryByRole('button', { name: /Solicitar baja/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Cancelar baja/ })).not.toBeInTheDocument();
  });

  it('renders the loading skeleton while fetching', () => {
    render(<KeysTable buildingId="b-1" keys={[]} isFetching />, { wrapper: makeWrapper() });

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('RFID')).toBeInTheDocument();
  });

  it('shows the empty state when there are no keys', () => {
    render(<KeysTable buildingId="b-1" keys={[]} />, { wrapper: makeWrapper() });

    expect(screen.getByText('No hay llaves registradas.')).toBeInTheDocument();
  });

  it('renders the pagination footer and only the first 10 rows', () => {
    render(<KeysTable buildingId="b-1" keys={makeKeys(15)} />, { wrapper: makeWrapper() });

    expect(screen.getByText('1–10 de 15')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(11); // 1 header + 10 body rows
  });
});
