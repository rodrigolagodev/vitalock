import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import type { ReactNode } from 'react';
import type { AdministrationRow } from '@/hooks/useAdministrations';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock('@/hooks/useMutateAdministration', () => ({
  useMutateAdministration: () => ({
    createAdministration: { mutateAsync: vi.fn(), isPending: false },
    updateAdministration: { mutateAsync: vi.fn(), isPending: false },
    deactivateAdministration: { mutateAsync: vi.fn(), isPending: false },
  }),
}));

vi.mock('@/hooks/useBuildings', () => ({
  useBuildings: () => ({ data: [] }),
}));

import { AdministrationsTable } from '../AdministrationsTable';

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(
      MemoryRouter,
      null,
      React.createElement(QueryClientProvider, { client: queryClient }, children),
    );
  };
}

const activeAdmin: AdministrationRow = {
  id: 'a-1',
  company_name: 'García S.A.',
  tax_id: '30-11122233-4',
  email: null,
  phone: null,
  address: 'Av. Corrientes 1234',
  status: 'active',
  notes: null,
};

const inactiveAdmin: AdministrationRow = {
  id: 'a-2',
  company_name: 'López S.R.L.',
  tax_id: null,
  email: null,
  phone: null,
  address: null,
  status: 'inactive',
  notes: null,
};

describe('AdministrationsTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders one card per administration instead of a table', () => {
    render(
      <AdministrationsTable administrations={[activeAdmin, inactiveAdmin]} isFetching={false} />,
      {
        wrapper: makeWrapper(),
      },
    );

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('renders each company_name as an anchor link to /administraciones/:id', () => {
    render(
      <AdministrationsTable administrations={[activeAdmin, inactiveAdmin]} isFetching={false} />,
      {
        wrapper: makeWrapper(),
      },
    );

    const link1 = screen.getByRole('link', { name: 'García S.A.' });
    expect(link1).toHaveAttribute('href', '/administraciones/a-1');

    const link2 = screen.getByRole('link', { name: 'López S.R.L.' });
    expect(link2).toHaveAttribute('href', '/administraciones/a-2');
  });

  it('renders the CUIT/CUIL and Dirección fallback dash when both are missing', () => {
    render(<AdministrationsTable administrations={[inactiveAdmin]} isFetching={false} />, {
      wrapper: makeWrapper(),
    });

    expect(screen.getAllByText('—')).toHaveLength(2);
  });

  it('renders the administration address', () => {
    render(<AdministrationsTable administrations={[activeAdmin]} isFetching={false} />, {
      wrapper: makeWrapper(),
    });

    expect(screen.getByText('Av. Corrientes 1234')).toBeInTheDocument();
  });

  it('renders the status badge for each administration', () => {
    render(
      <AdministrationsTable administrations={[activeAdmin, inactiveAdmin]} isFetching={false} />,
      {
        wrapper: makeWrapper(),
      },
    );

    expect(screen.getByText('Activa')).toBeInTheDocument();
    expect(screen.getByText('Inactiva')).toBeInTheDocument();
  });

  it('renders the loading skeleton while fetching', () => {
    const { container } = render(<AdministrationsTable administrations={[]} isFetching={true} />, {
      wrapper: makeWrapper(),
    });

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('shows the empty state when there are no administrations and no search', () => {
    render(<AdministrationsTable administrations={[]} isFetching={false} />, {
      wrapper: makeWrapper(),
    });

    expect(screen.getByText('No hay administraciones registradas.')).toBeInTheDocument();
  });

  it('shows the filtered empty state when a search term is applied', () => {
    render(<AdministrationsTable administrations={[]} isFetching={false} search="acme" />, {
      wrapper: makeWrapper(),
    });

    expect(screen.getByText('No se encontraron resultados para “acme”.')).toBeInTheDocument();
  });

  it('renders an Editar button and a Desactivar toggle for each active administration', () => {
    render(<AdministrationsTable administrations={[activeAdmin]} isFetching={false} />, {
      wrapper: makeWrapper(),
    });

    expect(screen.getByRole('button', { name: 'Editar a García S.A.' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desactivar García S.A.' })).toBeInTheDocument();
  });

  it('renders both action buttons with short visible labels, each sharing the row width equally', () => {
    render(<AdministrationsTable administrations={[activeAdmin]} isFetching={false} />, {
      wrapper: makeWrapper(),
    });

    const editButton = screen.getByRole('button', { name: 'Editar a García S.A.' });
    const deactivateButton = screen.getByRole('button', { name: 'Desactivar García S.A.' });
    expect(editButton).toHaveTextContent('Editar');
    expect(deactivateButton).toHaveTextContent('Desactivar');
    expect(editButton).toHaveClass('flex-1');
    expect(deactivateButton).toHaveClass('flex-1');
  });
});
