import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const { useAdministrationMock, useBuildingsMock } = vi.hoisted(() => ({
  useAdministrationMock: vi.fn(),
  useBuildingsMock: vi.fn(),
}));

vi.mock('@/hooks/useAdministration', () => ({ useAdministration: useAdministrationMock }));
vi.mock('@/hooks/useBuildings', () => ({ useBuildings: useBuildingsMock }));
vi.mock('@/components/buildings/BuildingFormSheet', () => ({ BuildingFormSheet: () => null }));
vi.mock('@/components/administrations/AdministrationFormSheet', () => ({
  AdministrationFormSheet: () => null,
}));

import AdministrationDetailPage from '../AdministrationDetailPage';

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/administraciones/a1']}>
        <Routes>
          <Route path="/administraciones/:adminId" element={<AdministrationDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AdministrationDetailPage breadcrumb', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBuildingsMock.mockReturnValue({ data: [], isFetching: false });
  });

  it('ends at the current administration as non-link text after the list link', () => {
    useAdministrationMock.mockReturnValue({
      data: {
        id: 'a1',
        company_name: 'Admin Uno',
        status: 'active',
        tax_id: null,
        address: null,
      },
      isLoading: false,
      isError: false,
    });
    renderPage();

    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    const link = within(nav).getByRole('link', { name: 'Administraciones' });
    expect(link).toHaveAttribute('href', '/administraciones');
    const tail = within(nav).getByText('Admin Uno');
    expect(tail.closest('a')).toBeNull();
    expect(nav.textContent?.endsWith('Admin Uno')).toBe(true);
  });

  it('renders no breadcrumb with an undefined or empty crumb while loading', () => {
    useAdministrationMock.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    renderPage();

    expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).not.toBeInTheDocument();
    expect(screen.queryByText('undefined')).not.toBeInTheDocument();
  });
});
