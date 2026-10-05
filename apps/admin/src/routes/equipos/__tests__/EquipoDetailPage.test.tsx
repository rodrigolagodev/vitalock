import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

describe('EquipoDetailPage states', () => {
  beforeEach(() => useEquipmentByIdMock.mockReset());

  function renderState(state: Record<string, unknown>) {
    useEquipmentByIdMock.mockReturnValue(state);
    return render(
      <MemoryRouter>
        <EquipoDetailPage />
      </MemoryRouter>,
    );
  }

  it('shows a labelled skeleton and no spinner while loading', () => {
    const { container } = renderState({ data: undefined, isLoading: true, isError: false });

    expect(screen.getByRole('status', { name: 'Cargando equipo' })).toBeInTheDocument();
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(3);
    expect(container.querySelector('.animate-spin')).toBeNull();
  });

  it('shows ErrorState with a retry that refetches exactly once', async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();
    renderState({ data: undefined, isLoading: false, isError: true, refetch });

    expect(screen.getByText('No se pudo cargar la información del equipo.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('shows NotFoundState with a way back when the record does not exist', () => {
    renderState({ data: null, isLoading: false, isError: false });

    expect(screen.getByText('Equipo no encontrado.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver al inventario' })).toHaveAttribute(
      'href',
      '/equipos',
    );
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
  });
});
