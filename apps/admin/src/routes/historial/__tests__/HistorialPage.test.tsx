import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
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
  it('renders the page heading "Historial"', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: /historial/i })).toBeInTheDocument();
  });

  it('renders a search input', () => {
    renderPage();
    expect(
      screen.getByPlaceholderText(/buscar por número de orden/i),
    ).toBeInTheDocument();
  });
});

describe('HistorialPage order_kind filter pills', () => {
  it('renders order_kind pills: Todos, Llaves, Servicio técnico', () => {
    renderPage();
    // Two "Todos" buttons exist (one per filter group), so we assert at least one
    const todosPills = screen.getAllByRole('button', { name: /^todos$/i });
    expect(todosPills.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('button', { name: /^llaves$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^servicio técnico$/i })).toBeInTheDocument();
  });

  it('passes orderKind filter to useAllOrders when a kind pill is clicked', async () => {
    renderPage();

    const llavesPill = screen.getByRole('button', { name: /^llaves$/i });
    await userEvent.click(llavesPill);

    const lastCall = useAllOrdersMock.mock.calls.at(-1)?.[0];
    expect(lastCall?.orderKind).toBe('key');
  });
});

describe('HistorialPage status filter', () => {
  it('renders status filter pills', () => {
    renderPage();
    // 'Todos' appears as both order_kind pill and status pill
    const todosPills = screen.getAllByRole('button', { name: /^todos$/i });
    expect(todosPills.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('button', { name: /facturado/i })).toBeInTheDocument();
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
