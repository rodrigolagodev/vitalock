import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import React from 'react';
import type { ReactNode } from 'react';
import type { BuildingRow } from '@/hooks/useBuildings';
import type { KeyRow } from '@/hooks/useKeys';
import type { EquipmentRow } from '@/hooks/useEquipment';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const useBuildingMock = vi.fn();
const useAdministrationMock = vi.fn();
const useKeysMock = vi.fn();
const useEquipmentMock = vi.fn();

vi.mock('@/hooks/useBuilding', () => ({ useBuilding: () => useBuildingMock() }));
vi.mock('@/hooks/useAdministration', () => ({ useAdministration: () => useAdministrationMock() }));
vi.mock('@/hooks/useKeys', () => ({ useKeys: () => useKeysMock() }));
vi.mock('@/hooks/useEquipment', () => ({ useEquipment: () => useEquipmentMock() }));
// Only opened via internal state (never triggered by these tests), but it
// calls useAuthContext() unconditionally at the top of its body — same
// shape as the useMutateTarea/Personal/Particular bug fixed earlier: mount
// it without a real AuthProvider and it throws before anything renders.
vi.mock('@/components/keys/KeyStatusChangeDialog', () => ({
  KeyStatusChangeDialog: () => null,
}));

import BuildingDetailPage from '../BuildingDetailPage';

const building: BuildingRow = {
  id: 'b1',
  name: 'Torre Norte',
  address: 'Av. Siempre Viva 123',
  status: 'active',
  administration_id: 'a1',
  key_count: 0,
  equipment_count: 0,
};

function makeKey(overrides: Partial<KeyRow> = {}): KeyRow {
  return {
    id: 'k1',
    rfid_code: 'RFID-0001',
    status: 'active',
    notes: null,
    activated_at: '2026-08-01T10:00:00Z',
    deactivated_at: null,
    picked_up_at: null,
    picked_up_by_name: null,
    picked_up_by_surname: null,
    picked_up_by_dni: null,
    delivered_by_staff_id: null,
    unit_id: 'u1',
    unit: {
      id: 'u1',
      number: '4B',
      unit_type: 'residential',
      is_administrative: false,
      status: 'active',
    },
    ...overrides,
  };
}

function makeEquipment(overrides: Partial<EquipmentRow> = {}): EquipmentRow {
  return {
    id: 'e1',
    model: 'Cerradura X200',
    serial_number: 'SN-0001',
    status: 'active',
    installed_at: '2026-08-01T10:00:00Z',
    building_id: 'b1',
    ...overrides,
  };
}

function makeWrapper(initialTab: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(
      MemoryRouter,
      { initialEntries: [`/buildings/b1?tab=${initialTab}`] },
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(
          Routes,
          null,
          React.createElement(Route, { path: '/buildings/:buildingId', element: children }),
        ),
      ),
    );
  };
}

describe('BuildingDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBuildingMock.mockReturnValue({ data: building, isLoading: false, isError: false });
    useAdministrationMock.mockReturnValue({ data: { company_name: 'García S.A.' } });
  });

  describe('Llaves tab', () => {
    beforeEach(() => {
      useEquipmentMock.mockReturnValue({ data: [], isFetching: false });
    });

    it('renders FilterBar.Search and FilterBar.Select for llaves', () => {
      useKeysMock.mockReturnValue({ data: [makeKey()], isFetching: false });
      render(<BuildingDetailPage />, { wrapper: makeWrapper('llaves') });

      expect(
        screen.getByPlaceholderText('Buscar llaves por código o unidad...'),
      ).toBeInTheDocument();
      expect(screen.getByRole('combobox', { name: 'Estado' })).toBeInTheDocument();
    });

    it('filters keys by RFID code or unit number', async () => {
      const user = userEvent.setup();
      useKeysMock.mockReturnValue({
        data: [
          makeKey({ id: 'k1', rfid_code: 'RFID-AAA' }),
          makeKey({ id: 'k2', rfid_code: 'RFID-BBB' }),
        ],
        isFetching: false,
      });
      render(<BuildingDetailPage />, { wrapper: makeWrapper('llaves') });

      await user.type(screen.getByPlaceholderText('Buscar llaves por código o unidad...'), 'AAA');

      expect(await screen.findByText('RFID-AAA')).toBeInTheDocument();
      await waitFor(() => expect(screen.queryByText('RFID-BBB')).not.toBeInTheDocument());
    });

    it('filters keys by status', async () => {
      const user = userEvent.setup();
      useKeysMock.mockReturnValue({
        data: [
          makeKey({ id: 'k1', rfid_code: 'RFID-ACTIVE', status: 'active' }),
          makeKey({ id: 'k2', rfid_code: 'RFID-DISABLED', status: 'disabled' }),
        ],
        isFetching: false,
      });
      render(<BuildingDetailPage />, { wrapper: makeWrapper('llaves') });

      await user.click(screen.getByRole('combobox', { name: 'Estado' }));
      await user.click(screen.getByRole('option', { name: 'Dada de baja' }));

      expect(screen.queryByText('RFID-ACTIVE')).not.toBeInTheDocument();
      expect(screen.getByText('RFID-DISABLED')).toBeInTheDocument();
    });

    it('clears both search and status when "Limpiar todo" is clicked', async () => {
      const user = userEvent.setup();
      useKeysMock.mockReturnValue({
        data: [
          makeKey({ id: 'k1', rfid_code: 'RFID-AAA' }),
          makeKey({ id: 'k2', rfid_code: 'RFID-BBB' }),
        ],
        isFetching: false,
      });
      render(<BuildingDetailPage />, { wrapper: makeWrapper('llaves') });

      await user.type(screen.getByPlaceholderText('Buscar llaves por código o unidad...'), 'AAA');
      await waitFor(() => expect(screen.queryByText('RFID-BBB')).not.toBeInTheDocument());

      await user.click(screen.getByRole('button', { name: 'Limpiar todo' }));

      expect(screen.getByText('RFID-AAA')).toBeInTheDocument();
      expect(screen.getByText('RFID-BBB')).toBeInTheDocument();
    });
  });

  describe('Equipos tab', () => {
    beforeEach(() => {
      useKeysMock.mockReturnValue({ data: [], isFetching: false });
    });

    it('renders FilterBar.Search for equipos', () => {
      useEquipmentMock.mockReturnValue({ data: [makeEquipment()], isFetching: false });
      render(<BuildingDetailPage />, { wrapper: makeWrapper('equipos') });

      expect(
        screen.getByPlaceholderText('Buscar equipos por serie o modelo...'),
      ).toBeInTheDocument();
    });

    it('filters equipment by serial number or model', async () => {
      const user = userEvent.setup();
      useEquipmentMock.mockReturnValue({
        data: [
          makeEquipment({ id: 'e1', serial_number: 'SN-AAA', model: 'Modelo A' }),
          makeEquipment({ id: 'e2', serial_number: 'SN-BBB', model: 'Modelo B' }),
        ],
        isFetching: false,
      });
      render(<BuildingDetailPage />, { wrapper: makeWrapper('equipos') });

      await user.type(screen.getByPlaceholderText('Buscar equipos por serie o modelo...'), 'AAA');

      expect(await screen.findByText('SN-AAA')).toBeInTheDocument();
      await waitFor(() => expect(screen.queryByText('SN-BBB')).not.toBeInTheDocument());
    });
  });
});
