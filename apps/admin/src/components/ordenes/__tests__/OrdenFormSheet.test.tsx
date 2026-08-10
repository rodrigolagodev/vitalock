import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import type { ReactNode } from 'react';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const mockCreateOrden = vi.fn();

vi.mock('@/hooks/useMutateOrden', () => ({
  useMutateOrden: () => ({
    createOrden: {
      mutateAsync: mockCreateOrden,
      isPending: false,
    },
  }),
}));

vi.mock('@/hooks/useAdministrations', () => ({
  useAdministrations: () => ({
    data: [
      { id: 'adm-1', company_name: 'Admin García S.A.' },
    ],
    isLoading: false,
  }),
}));

vi.mock('@/hooks/useBuildings', () => ({
  useBuildings: () => ({
    data: [
      { id: 'b-1', name: 'Torre Norte' },
    ],
    isLoading: false,
  }),
}));

vi.mock('@/hooks/mapMutationError', () => ({
  toastMutationError: vi.fn(),
}));

import { OrdenFormSheet } from '../OrdenFormSheet';

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

describe('OrdenFormSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the sheet when open=true', () => {
    render(
      <OrdenFormSheet open={true} onOpenChange={vi.fn()} />,
      { wrapper: makeWrapper() },
    );

    expect(screen.getByText('Nueva orden')).toBeInTheDocument();
  });

  it('does not render the sheet content when open=false', () => {
    render(
      <OrdenFormSheet open={false} onOpenChange={vi.fn()} />,
      { wrapper: makeWrapper() },
    );

    expect(screen.queryByText('Nueva orden')).not.toBeInTheDocument();
  });

  it('shows administration combobox when client_type is "administration" (default)', () => {
    render(
      <OrdenFormSheet open={true} onOpenChange={vi.fn()} />,
      { wrapper: makeWrapper() },
    );

    // Administration select trigger is present by default
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    // Particular fields should not be visible
    expect(screen.queryByLabelText(/nombre completo/i)).not.toBeInTheDocument();
  });

  it('shows particular fields after switching client_type radio to "particular"', async () => {
    const user = userEvent.setup();
    render(
      <OrdenFormSheet open={true} onOpenChange={vi.fn()} />,
      { wrapper: makeWrapper() },
    );

    const particularRadio = screen.getByDisplayValue('particular');
    await user.click(particularRadio);

    await waitFor(() => {
      expect(screen.getByLabelText(/nombre completo/i)).toBeInTheDocument();
    });
    // Administration select should not be visible anymore
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('shows DNI, phone, and email inputs only for particular client type', async () => {
    const user = userEvent.setup();
    render(
      <OrdenFormSheet open={true} onOpenChange={vi.fn()} />,
      { wrapper: makeWrapper() },
    );

    const particularRadio = screen.getByDisplayValue('particular');
    await user.click(particularRadio);

    await waitFor(() => {
      expect(screen.getByLabelText(/nombre completo/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/dni/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/teléfono/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    });
  });

  it('hides DNI, phone, email, and full_name when client_type is administration', () => {
    render(
      <OrdenFormSheet open={true} onOpenChange={vi.fn()} />,
      { wrapper: makeWrapper() },
    );

    expect(screen.queryByLabelText(/nombre completo/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/dni/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/teléfono/i)).not.toBeInTheDocument();
  });

  it('blocks submit when items array is empty and shows validation message', async () => {
    const user = userEvent.setup();
    render(
      <OrdenFormSheet open={true} onOpenChange={vi.fn()} />,
      { wrapper: makeWrapper() },
    );

    // Set administration_id via the hidden native select (Radix renders one for form compat)
    const hiddenSelect = document.querySelector(
      'select[name="administration_id"]',
    ) as HTMLSelectElement | null;
    if (hiddenSelect) {
      fireEvent.change(hiddenSelect, { target: { value: 'adm-1' } });
    }

    const submitButton = screen.getByRole('button', { name: /guardar/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/agregá al menos un ítem/i)).toBeInTheDocument();
    });
    expect(mockCreateOrden).not.toHaveBeenCalled();
  });

  it('adds item row when "Agregar ítem" is clicked', async () => {
    const user = userEvent.setup();
    render(
      <OrdenFormSheet open={true} onOpenChange={vi.fn()} />,
      { wrapper: makeWrapper() },
    );

    const addButton = screen.getByRole('button', { name: /agregar ítem/i });
    await user.click(addButton);

    // Item 1 label should appear
    expect(screen.getByText(/ítem 1/i)).toBeInTheDocument();
  });

  it('removes item row when "Eliminar" is clicked', async () => {
    const user = userEvent.setup();
    render(
      <OrdenFormSheet open={true} onOpenChange={vi.fn()} />,
      { wrapper: makeWrapper() },
    );

    const addButton = screen.getByRole('button', { name: /agregar ítem/i });
    await user.click(addButton);

    expect(screen.getByText(/ítem 1/i)).toBeInTheDocument();

    const removeButton = screen.getByRole('button', { name: /eliminar/i });
    await user.click(removeButton);

    expect(screen.queryByText(/ítem 1/i)).not.toBeInTheDocument();
  });

  it('shows Edificio field for key items (default item type)', async () => {
    const user = userEvent.setup();
    render(
      <OrdenFormSheet open={true} onOpenChange={vi.fn()} />,
      { wrapper: makeWrapper() },
    );

    const addButton = screen.getByRole('button', { name: /agregar ítem/i });
    await user.click(addButton);

    // Default type is 'key', so Edificio should appear
    await waitFor(() => {
      expect(screen.getByText(/edificio \*/i)).toBeInTheDocument();
    });
  });

  it('blocks submit for particular client with empty full_name', async () => {
    const user = userEvent.setup();
    render(
      <OrdenFormSheet open={true} onOpenChange={vi.fn()} />,
      { wrapper: makeWrapper() },
    );

    // Switch to particular
    const particularRadio = screen.getByDisplayValue('particular');
    await user.click(particularRadio);

    // Add an item
    const addButton = screen.getByRole('button', { name: /agregar ítem/i });
    await user.click(addButton);

    // Submit without filling full_name
    const submitButton = screen.getByRole('button', { name: /guardar/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/el nombre completo es obligatorio/i)).toBeInTheDocument();
    });
    expect(mockCreateOrden).not.toHaveBeenCalled();
  });

  it('calls createOrden with correct payload for a particular client with a non-key item', async () => {
    // Use particular client + non-key item to avoid Radix Select interactions
    // (Radix Select has hasPointerCapture issues in jsdom; we test the form logic, not the dropdown)
    const user = userEvent.setup();
    mockCreateOrden.mockResolvedValue('new-order-id');

    const onOpenChange = vi.fn();
    render(
      <OrdenFormSheet open={true} onOpenChange={onOpenChange} />,
      { wrapper: makeWrapper() },
    );

    // Switch to particular
    const particularRadio = screen.getByDisplayValue('particular');
    await user.click(particularRadio);

    await waitFor(() => {
      expect(screen.getByLabelText(/nombre completo/i)).toBeInTheDocument();
    });

    // Fill full_name (required)
    await user.type(screen.getByLabelText(/nombre completo/i), 'Juan Pérez');

    // Add an item (default type = 'key'); change it to equipment via hidden select to skip building requirement
    await user.click(screen.getByRole('button', { name: /agregar ítem/i }));

    // Use hidden aria-hidden select to change item_type to 'equipment' (no building_id required)
    const { container } = render(<></>, { wrapper: makeWrapper() });
    void container; // unused — we rely on the outer render's DOM

    // Change item_type to 'equipment' via the hidden native select Radix renders
    const hiddenSelects = document.querySelectorAll('select[aria-hidden="true"]');
    // First hidden select is administration_id (not visible), then item_type
    // Find the one with 'equipment' option
    let itemTypeSelect: HTMLSelectElement | null = null;
    for (const sel of Array.from(hiddenSelects)) {
      const s = sel as HTMLSelectElement;
      if (Array.from(s.options).some((o) => o.value === 'equipment')) {
        itemTypeSelect = s;
        break;
      }
    }
    if (itemTypeSelect) {
      await act(async () => {
        fireEvent.change(itemTypeSelect!, { target: { value: 'equipment' } });
      });
    }

    // Fill quantity (default is 1, which is valid)
    const submitButton = screen.getByRole('button', { name: /guardar/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockCreateOrden).toHaveBeenCalledWith(
        expect.objectContaining({
          order: expect.objectContaining({
            client_type: 'particular',
            particular_full_name: 'Juan Pérez',
            status: 'draft',
          }),
          items: expect.arrayContaining([
            expect.objectContaining({
              quantity: 1,
            }),
          ]),
        }),
      );
    });
  });

  it('closes the sheet on successful mutation', async () => {
    const user = userEvent.setup();
    mockCreateOrden.mockResolvedValue('new-order-id');

    const onOpenChange = vi.fn();
    render(
      <OrdenFormSheet open={true} onOpenChange={onOpenChange} />,
      { wrapper: makeWrapper() },
    );

    // Use particular client to avoid Radix Select for administration_id
    const particularRadio = screen.getByDisplayValue('particular');
    await user.click(particularRadio);

    await waitFor(() => {
      expect(screen.getByLabelText(/nombre completo/i)).toBeInTheDocument();
    });

    // Fill full_name
    await user.type(screen.getByLabelText(/nombre completo/i), 'María García');

    // Add an item and change type to 'equipment' via the hidden native select
    await user.click(screen.getByRole('button', { name: /agregar ítem/i }));

    const hiddenSelects = document.querySelectorAll('select[aria-hidden="true"]');
    let itemTypeSelect: HTMLSelectElement | null = null;
    for (const sel of Array.from(hiddenSelects)) {
      const s = sel as HTMLSelectElement;
      if (Array.from(s.options).some((o) => o.value === 'equipment')) {
        itemTypeSelect = s;
        break;
      }
    }
    if (itemTypeSelect) {
      await act(async () => {
        fireEvent.change(itemTypeSelect!, { target: { value: 'equipment' } });
      });
    }

    const submitButton = screen.getByRole('button', { name: /guardar/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
