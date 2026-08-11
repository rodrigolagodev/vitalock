import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';

const mockDeactivateParticular = vi.fn();

vi.mock('@/hooks/useMutateParticular', () => ({
  useMutateParticular: () => ({
    deactivateParticular: {
      mutateAsync: mockDeactivateParticular,
      isPending: false,
    },
  }),
}));

import { ParticularTable } from '../ParticularTable';
import type { ParticularRow } from '@/hooks/useParticulares';

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

describe('ParticularTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeactivateParticular.mockResolvedValue({ id: 'p-1', status: 'inactive' });
  });

  it('renders rows with the unit display and missing-field dashes', () => {
    const withoutUnit: ParticularRow = {
      id: 'p-2',
      unit_id: 'u-9',
      dni: '35111222',
      full_name: 'Sin Unidad',
      phone: null,
      email: null,
    };

    render(
      <ParticularTable rows={[garcia, withoutUnit]} isFetching={false} />,
      { wrapper: makeWrapper() },
    );

    expect(screen.getByText('García Juan')).toBeInTheDocument();
    expect(screen.getByText('30111222')).toBeInTheDocument();
    expect(screen.getByText('+54 11 1234-5678')).toBeInTheDocument();
    expect(screen.getByText('juan@example.com')).toBeInTheDocument();
    expect(screen.getByText('Unidad 101 — Torre Norte')).toBeInTheDocument();
    expect(screen.getByText('Sin Unidad')).toBeInTheDocument();
    // phone + email + unit columns all render the missing-value dash
    expect(screen.getAllByText('—')).toHaveLength(3);
  });

  it('renders the loading skeleton while fetching', () => {
    render(<ParticularTable rows={[]} isFetching />, { wrapper: makeWrapper() });

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('Nombre')).toBeInTheDocument();
  });

  it('shows the empty state when there are no rows and no filters', () => {
    render(<ParticularTable rows={[]} isFetching={false} />, {
      wrapper: makeWrapper(),
    });

    expect(
      screen.getByText('No hay particulares registrados.'),
    ).toBeInTheDocument();
  });

  it('shows the filtered empty state when filters are applied', () => {
    render(<ParticularTable rows={[]} isFetching={false} hasFilters />, {
      wrapper: makeWrapper(),
    });

    expect(
      screen.getByText('No se encontraron particulares con los filtros aplicados.'),
    ).toBeInTheDocument();
  });

  it('opens the deactivate dialog and calls deactivateParticular on confirm', async () => {
    const user = userEvent.setup();
    render(<ParticularTable rows={[garcia]} isFetching={false} />, {
      wrapper: makeWrapper(),
    });

    await user.click(
      screen.getByRole('button', { name: /dar de baja a garcía juan/i }),
    );

    expect(
      await screen.findByText('¿Dar de baja a García Juan?'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'El registro se conserva pero deja de aparecer y no puede vincularse a nuevas órdenes.',
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^dar de baja$/i }));

    await waitFor(() => {
      expect(mockDeactivateParticular).toHaveBeenCalledWith({ id: 'p-1' });
    });
  });

  it('cancelling the dialog does not call deactivateParticular', async () => {
    const user = userEvent.setup();
    render(<ParticularTable rows={[garcia]} isFetching={false} />, {
      wrapper: makeWrapper(),
    });

    await user.click(
      screen.getByRole('button', { name: /dar de baja a garcía juan/i }),
    );
    await user.click(screen.getByRole('button', { name: /cancelar/i }));

    expect(
      screen.queryByText('¿Dar de baja a García Juan?'),
    ).not.toBeInTheDocument();
    expect(mockDeactivateParticular).not.toHaveBeenCalled();
  });

  it('renders an Editar button only when onEdit is provided', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();

    const { rerender } = render(
      <ParticularTable rows={[garcia]} isFetching={false} />,
      { wrapper: makeWrapper() },
    );
    expect(screen.queryByRole('button', { name: /editar/i })).not.toBeInTheDocument();

    rerender(
      <ParticularTable rows={[garcia]} isFetching={false} onEdit={onEdit} />,
    );
    await user.click(screen.getByRole('button', { name: /editar/i }));
    expect(onEdit).toHaveBeenCalledWith(garcia);
  });
});
