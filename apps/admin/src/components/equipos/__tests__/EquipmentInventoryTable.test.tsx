import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { EquipmentInventoryTable } from '../EquipmentInventoryTable';
import type { EquipmentInventoryRow } from '@/hooks/useEquipmentInventory';

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
    render(<EquipmentInventoryTable rows={fakeRows} />);
    expect(screen.getByText('SN-001')).toBeInTheDocument();
    expect(screen.getByText('SN-002')).toBeInTheDocument();
  });

  it('renders building names', () => {
    render(<EquipmentInventoryTable rows={fakeRows} />);
    expect(screen.getByText('Torre Norte')).toBeInTheDocument();
    expect(screen.getByText('Torre Sur')).toBeInTheDocument();
  });

  it('renders key count for equipment with keys', () => {
    render(<EquipmentInventoryTable rows={fakeRows} />);
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('renders key count 0 for equipment with no keys', () => {
    render(<EquipmentInventoryTable rows={fakeRows} />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('renders fallback dash when model is null', () => {
    render(<EquipmentInventoryTable rows={fakeRows} />);
    // SN-002 has no model — expect at least one dash
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });

  it('shows empty message when rows is empty', () => {
    render(<EquipmentInventoryTable rows={[]} />);
    expect(screen.getByText(/no hay equipos/i)).toBeInTheDocument();
  });
});

describe('EquipmentInventoryTable key_labels expand', () => {
  it('shows key labels when equipment with keys is expanded', async () => {
    render(<EquipmentInventoryTable rows={fakeRows} />);
    // Click the expand button for first row (eq-1 has key_count=2)
    const expandBtn = screen.getByRole('button', { name: /ver llaves de SN-001/i });
    await userEvent.click(expandBtn);
    expect(screen.getByText('RFID-001')).toBeInTheDocument();
    expect(screen.getByText('RFID-002')).toBeInTheDocument();
  });

  it('does not show expand button when key_count is 0', () => {
    render(<EquipmentInventoryTable rows={fakeRows} />);
    // SN-002 has 0 keys — no expand button for it
    expect(screen.queryByRole('button', { name: /ver llaves de SN-002/i })).not.toBeInTheDocument();
  });
});
