import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { KeyDetail } from '@/hooks/useKeyById';

const { useKeyByIdMock, useKeyEventsMock } = vi.hoisted(() => ({
  useKeyByIdMock: vi.fn(),
  useKeyEventsMock: vi.fn(),
}));

vi.mock('@/hooks/useKeyById', () => ({ useKeyById: useKeyByIdMock }));
vi.mock('@/hooks/useKeyEvents', () => ({ useKeyEvents: useKeyEventsMock }));

import KeyDetailPage from '../KeyDetailPage';

const BASE: KeyDetail = {
  id: 'k-1',
  rfid_code: 'RFID-001',
  status: 'active',
  notes: null,
  activated_at: '2026-01-01T10:00:00Z',
  deactivated_at: null,
  picked_up_at: null,
  picked_up_by_name: null,
  picked_up_by_surname: null,
  picked_up_by_dni: null,
  delivered_by: null,
  unit: {
    id: 'u-1',
    number: '3B',
    unit_type: null,
    is_administrative: false,
    status: 'active',
    building: null,
  },
  authorized_equipment: [],
  associated_orders: [],
};

function renderPage(key: KeyDetail) {
  useKeyByIdMock.mockReturnValue({ data: key, isLoading: false, isError: false });
  useKeyEventsMock.mockReturnValue({ data: [], isLoading: false });
  return render(
    <MemoryRouter>
      <KeyDetailPage />
    </MemoryRouter>,
  );
}

describe('KeyDetailPage sections', () => {
  beforeEach(() => {
    useKeyByIdMock.mockReset();
    useKeyEventsMock.mockReset();
  });

  it.each([
    'Ubicación',
    'Custodia',
    'Equipos autorizados',
    'Ciclo de vida',
    'Órdenes asociadas',
    'Historial',
  ])('renders "%s" as a title-3 h2 inside a flat Card', (title) => {
    renderPage(BASE);
    const heading = screen.getByRole('heading', { level: 2, name: title });
    expect(heading).toHaveClass('text-title-3');
    expect(heading.closest('.rounded-container')).not.toBeNull();
  });

  it('renders Notas only when the key has notes', () => {
    renderPage({ ...BASE, notes: 'Llave de repuesto' });
    expect(screen.getByRole('heading', { level: 2, name: 'Notas' })).toHaveClass('text-title-3');
    expect(screen.getByText('Llave de repuesto')).toBeInTheDocument();
  });

  it('omits Notas when notes are empty', () => {
    renderPage(BASE);
    expect(screen.queryByRole('heading', { name: 'Notas' })).not.toBeInTheDocument();
  });
});
