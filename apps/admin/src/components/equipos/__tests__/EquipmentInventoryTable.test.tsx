import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import { EquipmentInventoryTable } from '../EquipmentInventoryTable';
import type { EquipmentInventoryRow } from '@/hooks/useEquipmentInventory';

function renderTable(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

const fakeRows: EquipmentInventoryRow[] = [
  {
    id: 'eq-1',
    serial_number: 'SN-001',
    model: 'Model X',
    status: 'active',
    access_type: 'rfid',
    building_id: 'bld-1',
    building_name: 'Torre Norte',
    administration_id: 'adm-1',
    administration_company_name: 'Garcia S.A.',
    key_count: 2,
    key_ids: ['key-1', 'key-2'],
    key_labels: ['RFID-001', 'RFID-002'],
  },
  {
    id: 'eq-2',
    serial_number: 'SN-002',
    model: null,
    status: 'maintenance',
    access_type: null,
    building_id: 'bld-2',
    building_name: 'Torre Sur',
    administration_id: 'adm-1',
    administration_company_name: 'Garcia S.A.',
    key_count: 0,
    key_ids: [],
    key_labels: [],
  },
];

describe('EquipmentInventoryTable rendering', () => {
  it('renders serial numbers', () => {
    renderTable(<EquipmentInventoryTable rows={fakeRows} />);
    expect(screen.getByText('SN-001')).toBeInTheDocument();
    expect(screen.getByText('SN-002')).toBeInTheDocument();
  });

  it('renders building names', () => {
    renderTable(<EquipmentInventoryTable rows={fakeRows} />);
    expect(screen.getByText('Torre Norte')).toBeInTheDocument();
    expect(screen.getByText('Torre Sur')).toBeInTheDocument();
  });

  it('renders key count for equipment with keys', () => {
    renderTable(<EquipmentInventoryTable rows={fakeRows} />);
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('renders key count 0 for equipment with no keys', () => {
    renderTable(<EquipmentInventoryTable rows={fakeRows} />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('renders fallback dash when model is null', () => {
    renderTable(<EquipmentInventoryTable rows={fakeRows} />);
    // SN-002 has no model — expect at least one dash
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });

  it('shows empty message when rows is empty', () => {
    renderTable(<EquipmentInventoryTable rows={[]} />);
    expect(screen.getByText(/no hay equipos/i)).toBeInTheDocument();
  });
});

