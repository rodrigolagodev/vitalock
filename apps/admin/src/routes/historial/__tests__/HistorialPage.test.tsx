import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom';
import React from 'react';

const { useAllOrdersMock } = vi.hoisted(() => ({ useAllOrdersMock: vi.fn() }));

vi.mock('@/hooks/useAllOrders', () => ({ useAllOrders: useAllOrdersMock }));

import HistorialPage from '../HistorialPage';

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
        React.createElement(HistorialPage),
      ),
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useAllOrdersMock.mockReturnValue({ data: [], isFetching: false, isError: false });
});

describe('HistorialPage heading and search', () => {
  it('renders the page heading "Órdenes"', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: /órdenes/i })).toBeInTheDocument();
  });

  it('renders a search input', () => {
    renderPage();
    expect(screen.getByPlaceholderText(/buscar por número de orden/i)).toBeInTheDocument();
  });
});

describe('HistorialPage order_kind filter', () => {
  it('renders a "Tipo" multi-select facet with Llaves and Servicio técnico options', async () => {
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /^tipo$/i }));
    const group = screen.getByRole('group', { name: /^tipo$/i });
    expect(within(group).getByRole('checkbox', { name: /^llaves$/i })).toBeInTheDocument();
    expect(
      within(group).getByRole('checkbox', { name: /^servicio técnico$/i }),
    ).toBeInTheDocument();
  });

  it('passes orderKind filter to useAllOrders when the Llaves checkbox is checked', async () => {
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /^tipo$/i }));
    await userEvent.click(screen.getByRole('checkbox', { name: /^llaves$/i }));

    const lastCall = useAllOrdersMock.mock.calls.at(-1)?.[0];
    expect(lastCall?.orderKind).toEqual(['key']);
  });
});

describe('HistorialPage status filter', () => {
  it('renders an "Estado" multi-select facet with all 8 live statuses', async () => {
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /^estado$/i }));
    const group = screen.getByRole('group', { name: /^estado$/i });
    expect(within(group).getByRole('checkbox', { name: /^facturado$/i })).toBeInTheDocument();
    expect(
      within(group).getByRole('checkbox', { name: /^pendiente instalación$/i }),
    ).toBeInTheDocument();
    expect(within(group).getAllByRole('checkbox')).toHaveLength(8);
  });

  it('passes statuses to useAllOrders when Facturado and one more status are checked', async () => {
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /^estado$/i }));
    await userEvent.click(screen.getByRole('checkbox', { name: /^facturado$/i }));
    await userEvent.click(screen.getByRole('checkbox', { name: /^confirmada$/i }));

    const lastCall = useAllOrdersMock.mock.calls.at(-1)?.[0];
    expect(lastCall?.status).toEqual(['invoiced', 'confirmed']);
  });
});

describe('HistorialPage empty state', () => {
  it('renders empty state when no data', () => {
    renderPage();
    expect(screen.getByText(/no hay órdenes en el historial/i)).toBeInTheDocument();
  });
});

describe('HistorialPage error state', () => {
  it('shows an error message when isError is true', () => {
    useAllOrdersMock.mockReturnValue({
      data: undefined,
      isFetching: false,
      isError: true,
    });

    renderPage();
    expect(screen.getByText(/error al cargar el historial/i)).toBeInTheDocument();
  });
});

describe('HistorialPage date-range filter', () => {
  // FilterBar.DateRange is a compact popover trigger now (see
  // packages/ui's FilterBar.tsx) — the Desde/Hasta inputs only exist in
  // the DOM once that trigger is opened, so every case here opens it
  // first via its accessible name ("Fecha") before querying the inputs.
  async function openDateRangePopover() {
    await userEvent.click(screen.getByRole('button', { name: /fecha/i }));
  }

  it('renders a "Desde" date input once the Fecha trigger is opened', async () => {
    renderPage();
    await openDateRangePopover();
    expect(screen.getByLabelText(/desde/i)).toBeInTheDocument();
  });

  it('renders a "Hasta" date input once the Fecha trigger is opened', async () => {
    renderPage();
    await openDateRangePopover();
    expect(screen.getByLabelText(/hasta/i)).toBeInTheDocument();
  });

  it('changing dateFrom passes it to useAllOrders', async () => {
    renderPage();
    await openDateRangePopover();
    const desdeInput = screen.getByLabelText(/desde/i);
    await userEvent.type(desdeInput, '2026-08-01');
    const lastCall = useAllOrdersMock.mock.calls.at(-1)?.[0];
    expect(lastCall?.dateFrom).toBe('2026-08-01');
  });

  it('changing dateTo passes it to useAllOrders', async () => {
    renderPage();
    await openDateRangePopover();
    const hastaInput = screen.getByLabelText(/hasta/i);
    await userEvent.type(hastaInput, '2026-08-31');
    const lastCall = useAllOrdersMock.mock.calls.at(-1)?.[0];
    expect(lastCall?.dateTo).toBe('2026-08-31');
  });

  it('hasFilters becomes true when dateFrom is set', async () => {
    // When hasFilters=true the "filtered empty" message appears
    renderPage();
    await openDateRangePopover();
    const desdeInput = screen.getByLabelText(/desde/i);
    // Simulate the user typing a date value
    await userEvent.type(desdeInput, '2026-08-01');
    // The last call to useAllOrders should include dateFrom
    const lastCall = useAllOrdersMock.mock.calls.at(-1)?.[0];
    expect(lastCall?.dateFrom).toBe('2026-08-01');
  });
});

describe('/historial → /ordenes redirect', () => {
  it('navigating to /historial redirects to /ordenes with replace semantics', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/historial']}>
          <Routes>
            <Route path="historial" element={<Navigate to="/ordenes" replace />} />
            <Route path="ordenes" element={<HistorialPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // After redirect, the hub renders at /ordenes
    expect(screen.getByRole('heading', { name: /órdenes/i })).toBeInTheDocument();
  });
});
