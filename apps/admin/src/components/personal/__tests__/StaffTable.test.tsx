import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';

const mockDeactivateStaff = vi.fn();

vi.mock('@/hooks/useMutateStaff', () => ({
  useMutateStaff: () => ({
    deactivateStaff: {
      mutateAsync: mockDeactivateStaff,
      isPending: false,
    },
  }),
}));

import { StaffTable } from '../StaffTable';
import type { StaffRow } from '@/hooks/usePersonal';

const ana: StaffRow = {
  id: 's-1',
  full_name: 'Ana Gómez',
  email: 'ana@example.com',
  phone: '+54 9 11 5555-0101',
  role: 'admin',
  status: 'active',
  notes: null,
  created_at: '2026-08-01T10:00:00Z',
};

const sinContacto: StaffRow = {
  id: 's-2',
  full_name: 'Bruno Díaz',
  email: null,
  phone: null,
  role: 'installer',
  status: 'active',
  notes: null,
  created_at: '2026-08-01T10:00:00Z',
};

function makeStaff(count: number): StaffRow[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `s-${i + 1}`,
    full_name: `Staff ${i + 1}`,
    email: `staff${i + 1}@example.com`,
    phone: '+54 9 11 5555-0000',
    role: 'installer' as const,
    status: 'active' as const,
    notes: null,
    created_at: '2026-08-01T10:00:00Z',
  }));
}

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe('StaffTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeactivateStaff.mockResolvedValue({ id: 's-1', status: 'inactive' });
  });

  it('renders rows with the role badge and missing-field dashes', () => {
    render(<StaffTable rows={[ana, sinContacto]} isFetching={false} />, {
      wrapper: makeWrapper(),
    });

    expect(screen.getByText('Ana Gómez')).toBeInTheDocument();
    expect(screen.getByText('ana@example.com')).toBeInTheDocument();
    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.getByText('Instalador')).toBeInTheDocument();
    // phone + email columns both render the missing-value dash
    expect(screen.getAllByText('—')).toHaveLength(2);
  });

  it('renders the loading skeleton while fetching', () => {
    render(<StaffTable rows={[]} isFetching />, { wrapper: makeWrapper() });

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('Nombre')).toBeInTheDocument();
  });

  it('shows the empty state when there are no rows and no filters', () => {
    render(<StaffTable rows={[]} isFetching={false} />, { wrapper: makeWrapper() });

    expect(screen.getByText('No hay personal registrado.')).toBeInTheDocument();
  });

  it('shows the filtered empty state when filters are applied', () => {
    render(<StaffTable rows={[]} isFetching={false} hasFilters />, {
      wrapper: makeWrapper(),
    });

    expect(
      screen.getByText('No se encontró personal con los filtros aplicados.'),
    ).toBeInTheDocument();
  });

  it('renders the pagination footer and only the first 10 rows', () => {
    render(<StaffTable rows={makeStaff(12)} isFetching={false} />, {
      wrapper: makeWrapper(),
    });

    expect(screen.getByText('1–10 de 12')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(11); // 1 header + 10 body rows
  });

  it('opens the deactivate dialog and calls deactivateStaff on confirm', async () => {
    const user = userEvent.setup();
    render(<StaffTable rows={[ana]} isFetching={false} />, { wrapper: makeWrapper() });

    await user.click(
      screen.getByRole('button', { name: /dar de baja a ana gómez/i }),
    );

    expect(
      await screen.findByText('¿Dar de baja a Ana Gómez?'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('El registro se conserva pero deja de aparecer y pierde acceso.'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^dar de baja$/i }));

    await waitFor(() => {
      expect(mockDeactivateStaff).toHaveBeenCalledWith({ id: 's-1' });
    });
  });

  it('cancelling the dialog does not call deactivateStaff', async () => {
    const user = userEvent.setup();
    render(<StaffTable rows={[ana]} isFetching={false} />, { wrapper: makeWrapper() });

    await user.click(
      screen.getByRole('button', { name: /dar de baja a ana gómez/i }),
    );
    await user.click(screen.getByRole('button', { name: /cancelar/i }));

    expect(
      screen.queryByText('¿Dar de baja a Ana Gómez?'),
    ).not.toBeInTheDocument();
    expect(mockDeactivateStaff).not.toHaveBeenCalled();
  });

  it('renders an Editar button with aria-label only when onEdit is provided', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();

    const { rerender } = render(
      <StaffTable rows={[ana]} isFetching={false} />,
      { wrapper: makeWrapper() },
    );
    expect(screen.queryByRole('button', { name: /editar/i })).not.toBeInTheDocument();

    rerender(<StaffTable rows={[ana]} isFetching={false} onEdit={onEdit} />);
    await user.click(screen.getByRole('button', { name: 'Editar a Ana Gómez' }));
    expect(onEdit).toHaveBeenCalledWith(ana);
  });
});
