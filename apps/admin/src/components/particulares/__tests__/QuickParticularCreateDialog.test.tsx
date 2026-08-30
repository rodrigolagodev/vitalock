import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import type { ReactNode } from 'react';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const mockCreateParticular = vi.fn();

vi.mock('@/hooks/useMutateParticular', () => ({
  useMutateParticular: () => ({
    createParticular: { mutateAsync: mockCreateParticular, isPending: false },
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

vi.mock('@/lib/errors/toast', () => ({
  toastMutationError: vi.fn(),
}));

vi.mock('@/hooks/useMutateUnit', () => ({
  useMutateUnit: () => ({
    createUnit: { mutateAsync: vi.fn(), isPending: false },
    updateUnit: { mutateAsync: vi.fn(), isPending: false },
    deactivateUnit: { mutateAsync: vi.fn(), isPending: false },
  }),
}));

import { QuickParticularCreateDialog } from '../QuickParticularCreateDialog';

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(
      MemoryRouter,
      null,
      React.createElement(QueryClientProvider, { client: queryClient }, children),
    );
  };
}

const createdRow = {
  id: 'new-particular-id',
  unit_id: 'u-1',
  dni: '30111222',
  full_name: 'Juan García',
  phone: null,
  email: null,
};

describe('QuickParticularCreateDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseUnits.mockReturnValue({
      data: [{ id: 'u-1', number: '101' }, { id: 'u-2', number: '102' }],
      isLoading: false,
    });
  });

  it('blocks save when required fields are empty', async () => {
    const user = userEvent.setup();
    render(
      <QuickParticularCreateDialog open onOpenChange={vi.fn()} onCreated={vi.fn()} />,
      { wrapper: makeWrapper() },
    );

    await user.click(screen.getByRole('button', { name: /^crear$/i }));

    await waitFor(() => {
      expect(screen.getByText('El nombre es obligatorio')).toBeInTheDocument();
      expect(screen.getByText('El DNI es obligatorio')).toBeInTheDocument();
    });
    // Building and unit are optional — a particular can be created without them.
    expect(screen.queryByText('El edificio es obligatorio')).not.toBeInTheDocument();
    expect(screen.queryByText('La unidad es obligatoria')).not.toBeInTheDocument();
    expect(mockCreateParticular).not.toHaveBeenCalled();
  });

  it('creates the particular without a unit when neither is selected', async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    mockCreateParticular.mockResolvedValue({ ...createdRow, unit_id: null });

    render(
      <QuickParticularCreateDialog open onOpenChange={vi.fn()} onCreated={onCreated} />,
      { wrapper: makeWrapper() },
    );

    await user.type(screen.getByLabelText(/nombre completo/i), 'Juan García');
    await user.type(screen.getByLabelText(/dni/i), '30111222');

    await user.click(screen.getByRole('button', { name: /^crear$/i }));

    await waitFor(() => {
      expect(mockCreateParticular).toHaveBeenCalledWith({
        unit_id: null,
        dni: '30111222',
        full_name: 'Juan García',
        phone: null,
        email: null,
      });
    });
  });

  it('creates the particular with the chosen unit and fires onCreated', async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    mockCreateParticular.mockResolvedValue(createdRow);

    render(
      <QuickParticularCreateDialog open onOpenChange={vi.fn()} onCreated={onCreated} />,
      { wrapper: makeWrapper() },
    );

    await user.type(screen.getByLabelText(/nombre completo/i), 'Juan García');
    await user.type(screen.getByLabelText(/dni/i), '30111222');

    // Two-step unit: building first, then unit
    await user.click(screen.getByRole('combobox', { name: /edificio/i }));
    await user.click(await screen.findByRole('option', { name: 'Torre Norte' }));
    await user.click(screen.getByRole('combobox', { name: /unidad/i }));
    await user.click(await screen.findByRole('option', { name: '101' }));

    await user.click(screen.getByRole('button', { name: /^crear$/i }));

    await waitFor(() => {
      expect(mockCreateParticular).toHaveBeenCalledWith({
        unit_id: 'u-1',
        dni: '30111222',
        full_name: 'Juan García',
        phone: null,
        email: null,
      });
    });
    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith(createdRow);
    });
  });

  it('closes the dialog after a successful creation', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    mockCreateParticular.mockResolvedValue(createdRow);

    render(
      <QuickParticularCreateDialog
        open
        onOpenChange={onOpenChange}
        onCreated={vi.fn()}
      />,
      { wrapper: makeWrapper() },
    );

    await user.type(screen.getByLabelText(/nombre completo/i), 'Juan García');
    await user.type(screen.getByLabelText(/dni/i), '30111222');
    await user.click(screen.getByRole('combobox', { name: /edificio/i }));
    await user.click(await screen.findByRole('option', { name: 'Torre Norte' }));
    await user.click(screen.getByRole('combobox', { name: /unidad/i }));
    await user.click(await screen.findByRole('option', { name: '101' }));
    await user.click(screen.getByRole('button', { name: /^crear$/i }));

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('keeps the unit select disabled until a building is chosen', () => {
    render(
      <QuickParticularCreateDialog open onOpenChange={vi.fn()} onCreated={vi.fn()} />,
      { wrapper: makeWrapper() },
    );

    expect(screen.getByRole('combobox', { name: /unidad/i })).toBeDisabled();
  });
});
