import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import type { KeysInventoryRow } from '@/hooks/useKeysInventory';

// Hoisted mocks
const {
  useKeysInventoryMock,
  useAdministrationsMock,
  useBuildingsMock,
  useEquipmentByBuildingMock,
} = vi.hoisted(() => ({
  useKeysInventoryMock: vi.fn(),
  useAdministrationsMock: vi.fn(),
  useBuildingsMock: vi.fn(),
  useEquipmentByBuildingMock: vi.fn(),
}));

vi.mock('@/hooks/useKeysInventory', () => ({ useKeysInventory: useKeysInventoryMock }));
vi.mock('@/hooks/useAdministrations', () => ({ useAdministrations: useAdministrationsMock }));
vi.mock('@/hooks/useBuildings', () => ({ useBuildings: useBuildingsMock }));
vi.mock('@/hooks/useEquipmentByBuilding', () => ({
  useEquipmentByBuilding: useEquipmentByBuildingMock,
}));

import InventarioPage from '../InventarioPage';

function makeRow(overrides: Partial<KeysInventoryRow> = {}): KeysInventoryRow {
  return {
    id: 'key-1',
    rfid_code: 'RFID-001',
    physical_status: 'active',
    unit_id: 'unit-1',
    unit_number: '1A',
    building_id: 'bld-1',
    building_name: 'Torre Norte',
    administration_id: 'adm-1',
    administration_company_name: 'Garcia S.A.',
    equipment_id: null,
    equipment_serial_number: null,
    equipment_model: null,
    active_order_id: null,
    active_order_status: null,
    ...overrides,
  };
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(InventarioPage),
      ),
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useKeysInventoryMock.mockReturnValue({ data: [], isFetching: false, isError: false });
  useAdministrationsMock.mockReturnValue({ data: [], isFetching: false });
  useBuildingsMock.mockReturnValue({ data: [], isFetching: false });
  useEquipmentByBuildingMock.mockReturnValue({ data: [], isFetching: false });
});

describe('InventarioPage rendering', () => {
  it('renders the page heading', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: /inventario de llaves/i })).toBeInTheDocument();
  });

  it('renders the "Crear orden de llave" link to /llaves/nueva', () => {
    renderPage();
    const link = screen.getByRole('link', { name: /crear orden de llave/i });
    expect(link).toHaveAttribute('href', '/llaves/nueva');
  });

  it('renders empty state when no data', () => {
    renderPage();
    expect(screen.getByText(/no hay llaves/i)).toBeInTheDocument();
  });

  it('renders rows when data is present', () => {
    useKeysInventoryMock.mockReturnValue({
      data: [makeRow({ rfid_code: 'RFID-001' }), makeRow({ id: 'key-2', rfid_code: 'RFID-002' })],
      isFetching: false,
      isError: false,
    });
    renderPage();
    expect(screen.getByText('RFID-001')).toBeInTheDocument();
    expect(screen.getByText('RFID-002')).toBeInTheDocument();
  });

  it('shows error message when isError is true', () => {
    useKeysInventoryMock.mockReturnValue({
      data: undefined,
      isFetching: false,
      isError: true,
    });
    renderPage();
    expect(screen.getByText(/error al cargar/i)).toBeInTheDocument();
  });
});

describe('InventarioPage cascade filter', () => {
  it('renders the Administración select', () => {
    renderPage();
    expect(screen.getByLabelText(/administración/i)).toBeInTheDocument();
  });

  it('renders the Edificio select (disabled when no admin selected)', () => {
    renderPage();
    expect(screen.getByLabelText(/edificio/i)).toBeDisabled();
  });
});
