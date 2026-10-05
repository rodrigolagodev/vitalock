import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { EquipmentDetail } from '@/hooks/useEquipmentById';

const { useEquipmentByIdMock } = vi.hoisted(() => ({ useEquipmentByIdMock: vi.fn() }));

vi.mock('@/hooks/useEquipmentById', () => ({ useEquipmentById: useEquipmentByIdMock }));
vi.mock('@/components/equipment/EquipmentKeySnapshotPanel', () => ({
  EquipmentKeySnapshotPanel: () => null,
}));
vi.mock('@/components/equipment/EquipmentUpdateHistoryPanel', () => ({
  EquipmentUpdateHistoryPanel: () => null,
}));

import EquipoDetailPage from '../EquipoDetailPage';

const BASE: EquipmentDetail = {
  id: 'e-1',
  serial_number: 'SN-001',
  model: 'Lector X',
  description: 'Lector de acceso',
  access_type: null,
  status: 'active',
  installed_at: '2026-01-01T10:00:00Z',
  decommissioned_at: null,
  decommission_reason: null,
  notes: null,
  building: null,
  replaces: null,
  replaced_by: null,
  authorized_keys: [],
  associated_orders: [],
};

function renderPage(equipment: EquipmentDetail) {
  useEquipmentByIdMock.mockReturnValue({ data: equipment, isLoading: false, isError: false });
  return render(
    <MemoryRouter>
      <EquipoDetailPage />
    </MemoryRouter>,
  );
}

describe('EquipoDetailPage sections', () => {
  beforeEach(() => useEquipmentByIdMock.mockReset());

  it.each([
    'Ubicación',
    'Historial',
    'Llaves autorizadas',
    'Órdenes técnicas asociadas',
    'Llaves pendientes de actualización',
    'Historial de actualizaciones de firmware',
  ])('renders "%s" as a title-3 h2 inside a flat Card', (title) => {
    renderPage(BASE);
    const heading = screen.getByRole('heading', { level: 2, name: title });
    expect(heading).toHaveClass('text-title-3');
    expect(heading.closest('.rounded-container')).not.toBeNull();
  });

  it('renders the optional Notas and Cadena de reemplazos sections only when present', () => {
    renderPage({
      ...BASE,
      notes: 'Revisar firmware',
      replaces: { id: 'e-0', serial_number: 'SN-000', model: null },
    });
    expect(screen.getByRole('heading', { level: 2, name: 'Notas' })).toHaveClass('text-title-3');
    expect(screen.getByRole('heading', { level: 2, name: 'Cadena de reemplazos' })).toHaveClass(
      'text-title-3',
    );
    expect(screen.getByText('Revisar firmware')).toBeInTheDocument();
  });

  it('omits the optional sections when there is nothing to show', () => {
    renderPage(BASE);
    expect(screen.queryByRole('heading', { name: 'Notas' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Cadena de reemplazos' })).not.toBeInTheDocument();
  });
});
