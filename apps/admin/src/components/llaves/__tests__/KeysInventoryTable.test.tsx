import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

import { KeysInventoryTable } from '../KeysInventoryTable';
import type { KeysInventoryRow } from '@/hooks/useKeysInventory';

const makeRow = (overrides: Partial<KeysInventoryRow> = {}): KeysInventoryRow => ({
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
});

describe('KeysInventoryTable', () => {
  it('renders empty state when rows is empty', () => {
    render(<KeysInventoryTable rows={[]} isFetching={false} />);
    expect(screen.getByText(/no hay llaves/i)).toBeInTheDocument();
  });

  it('renders the rfid_code of each row', () => {
    const rows = [makeRow({ rfid_code: 'RFID-001' }), makeRow({ id: 'key-2', rfid_code: 'RFID-002' })];
    render(<KeysInventoryTable rows={rows} isFetching={false} />);
    expect(screen.getByText('RFID-001')).toBeInTheDocument();
    expect(screen.getByText('RFID-002')).toBeInTheDocument();
  });

  it('renders the building_name', () => {
    render(<KeysInventoryTable rows={[makeRow({ building_name: 'Torre Norte' })]} isFetching={false} />);
    expect(screen.getByText('Torre Norte')).toBeInTheDocument();
  });

  it('renders the administration_company_name', () => {
    render(<KeysInventoryTable rows={[makeRow({ administration_company_name: 'Garcia S.A.' })]} isFetching={false} />);
    expect(screen.getByText('Garcia S.A.')).toBeInTheDocument();
  });

  it('renders the unit_number', () => {
    render(<KeysInventoryTable rows={[makeRow({ unit_number: '3B' })]} isFetching={false} />);
    expect(screen.getByText('3B')).toBeInTheDocument();
  });

  it('renders "—" when equipment_serial_number is null', () => {
    render(<KeysInventoryTable rows={[makeRow({ equipment_serial_number: null })]} isFetching={false} />);
    // At least one em-dash displayed
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('renders equipment_serial_number when present', () => {
    render(<KeysInventoryTable rows={[makeRow({ equipment_serial_number: 'SN-999' })]} isFetching={false} />);
    expect(screen.getByText('SN-999')).toBeInTheDocument();
  });

  it('renders active_order_status when active_order_id is present', () => {
    render(
      <KeysInventoryTable
        rows={[makeRow({ active_order_id: 'ord-1', active_order_status: 'confirmed' })]}
        isFetching={false}
      />,
    );
    expect(document.body.textContent).toContain('confirmed');
  });

  it('renders "Sin orden" when active_order_id is null', () => {
    render(<KeysInventoryTable rows={[makeRow({ active_order_id: null })]} isFetching={false} />);
    expect(screen.getByText('Sin orden')).toBeInTheDocument();
  });
});
