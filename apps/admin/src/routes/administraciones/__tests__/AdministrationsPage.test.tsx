import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import type { AdministrationRow } from '@/hooks/useAdministrations';

const { useAdministrationsMock } = vi.hoisted(() => ({
  useAdministrationsMock: vi.fn(),
}));

vi.mock('@/hooks/useAdministrations', () => ({
  useAdministrations: useAdministrationsMock,
}));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/components/administrations/AdministrationFormSheet', () => ({
  AdministrationFormSheet: () => null,
}));

import AdministrationsPage from '../AdministrationsPage';

function makeAdministrations(): AdministrationRow[] {
  return [
    {
      id: 'a1',
      company_name: 'Torre Norte',
      tax_id: '30-71000000-1',
      email: null,
      phone: null,
      address: null,
      notes: null,
      status: 'active',
    },
    {
      id: 'a2',
      company_name: 'Edificio Sur',
      tax_id: '30-72000000-2',
      email: null,
      phone: null,
      address: null,
      notes: null,
      status: 'active',
    },
    {
      id: 'a3',
      company_name: 'Complejo Este',
      tax_id: '30-73000000-3',
      email: null,
      phone: null,
      address: null,
      notes: null,
      status: 'inactive',
    },
  ];
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(AdministrationsPage),
      ),
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useAdministrationsMock.mockReturnValue({
    data: [],
    isFetching: false,
    isError: false,
  });
});

describe('AdministrationsPage stat cards', () => {
  it('shows total and active administrations derived from the loaded rows', () => {
    useAdministrationsMock.mockReturnValue({
      data: makeAdministrations(),
      isFetching: false,
      isError: false,
    });

    renderPage();

    const cards = screen.getByTestId('stat-cards');
    expect(within(cards).getByText('Total administraciones')).toBeInTheDocument();
    expect(within(cards).getByText('3')).toBeInTheDocument();
    expect(within(cards).getByText('Activas')).toBeInTheDocument();
    expect(within(cards).getByText('2')).toBeInTheDocument();
  });
});
