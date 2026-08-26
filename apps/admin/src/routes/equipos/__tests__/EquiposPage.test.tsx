import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

// Mock hooks
vi.mock('@/hooks/useEquipmentInventory', () => ({
  useEquipmentInventory: vi.fn(() => ({ data: [], isFetching: false, isError: false })),
}));
vi.mock('@/hooks/useAdministrations', () => ({
  useAdministrations: vi.fn(() => ({ data: [] })),
}));
vi.mock('@/hooks/useBuildings', () => ({
  useBuildings: vi.fn(() => ({ data: [] })),
}));
vi.mock('@/hooks/useEquipmentByBuilding', () => ({
  useEquipmentByBuilding: vi.fn(() => ({ data: [] })),
}));

import EquiposPage from '../EquiposPage';

function renderPage() {
  return render(
    <MemoryRouter>
      <EquiposPage />
    </MemoryRouter>,
  );
}

describe('EquiposPage rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the page heading', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: /inventario de equipos/i })).toBeInTheDocument();
  });

  it('renders the "Crear orden técnica" shortcut button', () => {
    renderPage();
    expect(
      screen.getByRole('link', { name: /crear orden técnica/i }),
    ).toBeInTheDocument();
  });

  it('"Crear orden técnica" link points to /servicio-tecnico/nueva', () => {
    renderPage();
    const link = screen.getByRole('link', { name: /crear orden técnica/i });
    expect(link).toHaveAttribute('href', '/servicio-tecnico/nueva');
  });

  it('renders the equipment status filter', () => {
    renderPage();
    expect(screen.getByLabelText(/estado del equipo/i)).toBeInTheDocument();
  });

  it('renders the cascade filter (administración select)', () => {
    renderPage();
    expect(screen.getByLabelText(/administración/i)).toBeInTheDocument();
  });

  it('renders the equipment inventory table', () => {
    renderPage();
    expect(screen.getByText(/no hay equipos/i)).toBeInTheDocument();
  });

  it('shows error message when isError is true', async () => {
    const { useEquipmentInventory } = await import('@/hooks/useEquipmentInventory');
    vi.mocked(useEquipmentInventory).mockReturnValueOnce({
      data: [],
      isFetching: false,
      isError: true,
    } as unknown as ReturnType<typeof useEquipmentInventory>);
    renderPage();
    expect(screen.getByText(/error al cargar/i)).toBeInTheDocument();
  });
});
