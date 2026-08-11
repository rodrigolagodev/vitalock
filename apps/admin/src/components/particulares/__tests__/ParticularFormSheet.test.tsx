import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const mockCreateParticular = vi.fn();
const mockUpdateParticular = vi.fn();

vi.mock('@/hooks/useMutateParticular', () => ({
  useMutateParticular: () => ({
    createParticular: { mutateAsync: mockCreateParticular, isPending: false },
    updateParticular: { mutateAsync: mockUpdateParticular, isPending: false },
  }),
}));

vi.mock('@/hooks/useBuildings', () => ({
  useBuildings: () => ({
    data: [
      { id: 'b-1', name: 'Torre Norte' },
      { id: 'b-2', name: 'Edificio Sur' },
    ],
    isLoading: false,
  }),
}));

const mockUseUnits = vi.fn();

vi.mock('@/hooks/useUnits', () => ({
  useUnits: (buildingId: string) => mockUseUnits(buildingId),
}));

vi.mock('@/hooks/mapMutationError', () => ({
  toastMutationError: vi.fn(),
}));

vi.mock('@/hooks/useMutateUnit', () => ({
  useMutateUnit: () => ({
    createUnit: { mutateAsync: vi.fn(), isPending: false },
    updateUnit: { mutateAsync: vi.fn(), isPending: false },
    deactivateUnit: { mutateAsync: vi.fn(), isPending: false },
  }),
}));

import { ParticularFormSheet } from '../ParticularFormSheet';
import type { ParticularRow } from '@/hooks/useParticulares';

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children,
    );
  };
}

const garcia: ParticularRow = {
  id: 'p-1',
  unit_id: 'u-1',
  dni: '30111222',
  full_name: 'García Juan',
  phone: '+54 11 1234-5678',
  email: 'juan@example.com',
  unit_number: '101',
  building_name: 'Torre Norte',
  unit_building_id: 'b-1',
};

describe('ParticularFormSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateParticular.mockResolvedValue({ id: 'p-new' });
    mockUpdateParticular.mockResolvedValue({ id: 'p-1' });
    mockUseUnits.mockReturnValue({
      data: [{ id: 'u-1', number: '101' }, { id: 'u-2', number: '102' }],
      isLoading: false,
    });
  });

  it('keeps the unit select disabled until a building is chosen', () => {
    render(
      <ParticularFormSheet open onOpenChange={vi.fn()} />,
      { wrapper: makeWrapper() },
    );

    expect(screen.getByRole('combobox', { name: /unidad/i })).toBeDisabled();
  });

  it('blocks save when required fields are empty', async () => {
    const user = userEvent.setup();
    render(<ParticularFormSheet open onOpenChange={vi.fn()} />, {
      wrapper: makeWrapper(),
    });

    await user.click(screen.getByRole('button', { name: /^guardar$/i }));

    await waitFor(() => {
      expect(screen.getByText('El nombre es obligatorio')).toBeInTheDocument();
      expect(screen.getByText('El DNI es obligatorio')).toBeInTheDocument();
    });
    // Building and unit are now optional in this sheet.
    expect(screen.queryByText('El edificio es obligatorio')).not.toBeInTheDocument();
    expect(screen.queryByText('La unidad es obligatoria')).not.toBeInTheDocument();
    expect(mockCreateParticular).not.toHaveBeenCalled();
    expect(mockUpdateParticular).not.toHaveBeenCalled();
  });

  it('create path submits CreateParticularInput', async () => {
    const user = userEvent.setup();
    render(<ParticularFormSheet open onOpenChange={vi.fn()} />, {
      wrapper: makeWrapper(),
    });

    await user.type(screen.getByLabelText(/nombre/i), 'García Juan');
    await user.type(screen.getByLabelText(/dni/i), '30111222');
    await user.type(screen.getByLabelText(/teléfono/i), '+54 11 1234-5678');
    await user.type(screen.getByLabelText(/email/i), 'juan@example.com');

    await user.click(screen.getByRole('combobox', { name: /edificio/i }));
    await user.click(await screen.findByRole('option', { name: 'Torre Norte' }));
    await user.click(screen.getByRole('combobox', { name: /unidad/i }));
    await user.click(await screen.findByRole('option', { name: '101' }));

    await user.click(screen.getByRole('button', { name: /^guardar$/i }));

    await waitFor(() => {
      expect(mockCreateParticular).toHaveBeenCalledWith({
        unit_id: 'u-1',
        dni: '30111222',
        full_name: 'García Juan',
        phone: '+54 11 1234-5678',
        email: 'juan@example.com',
      });
    });
    expect(mockUpdateParticular).not.toHaveBeenCalled();
  });

  it('edit path prefills the row and submits UpdateParticularInput', async () => {
    const user = userEvent.setup();
    render(
      <ParticularFormSheet
        open
        onOpenChange={vi.fn()}
        particular={garcia}
      />,
      { wrapper: makeWrapper() },
    );

    expect(screen.getByRole('combobox', { name: /edificio/i })).toHaveTextContent(
      'Torre Norte',
    );
    expect(screen.getByRole('combobox', { name: /unidad/i })).not.toBeDisabled();
    expect(screen.getByLabelText(/nombre/i)).toHaveValue('García Juan');
    expect(screen.getByLabelText(/dni/i)).toHaveValue('30111222');

    await user.clear(screen.getByLabelText(/nombre/i));
    await user.type(screen.getByLabelText(/nombre/i), 'García Juan Actualizado');
    await user.click(screen.getByRole('button', { name: /^guardar$/i }));

    await waitFor(() => {
      expect(mockUpdateParticular).toHaveBeenCalledWith({
        id: 'p-1',
        unit_id: 'u-1',
        dni: '30111222',
        full_name: 'García Juan Actualizado',
        phone: '+54 11 1234-5678',
        email: 'juan@example.com',
      });
    });
    expect(mockCreateParticular).not.toHaveBeenCalled();
  });

  it('changing the building resets the picked unit', async () => {
    const user = userEvent.setup();
    render(
      <ParticularFormSheet open onOpenChange={vi.fn()} particular={garcia} />,
      { wrapper: makeWrapper() },
    );

    await user.click(screen.getByRole('combobox', { name: /edificio/i }));
    await user.click(await screen.findByRole('option', { name: 'Edificio Sur' }));

    expect(mockUseUnits).toHaveBeenCalledWith('b-2');
    expect(screen.getByRole('combobox', { name: /unidad/i })).not.toBeDisabled();
  });

  it('closes the sheet after a successful create', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<ParticularFormSheet open onOpenChange={onOpenChange} />, {
      wrapper: makeWrapper(),
    });

    await user.type(screen.getByLabelText(/nombre/i), 'García Juan');
    await user.type(screen.getByLabelText(/dni/i), '30111222');
    await user.click(screen.getByRole('combobox', { name: /edificio/i }));
    await user.click(await screen.findByRole('option', { name: 'Torre Norte' }));
    await user.click(screen.getByRole('combobox', { name: /unidad/i }));
    await user.click(await screen.findByRole('option', { name: '101' }));
    await user.click(screen.getByRole('button', { name: /^guardar$/i }));

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
