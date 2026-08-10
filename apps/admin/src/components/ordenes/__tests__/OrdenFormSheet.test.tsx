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

const mockUseParticulares = vi.fn();

vi.mock('@/hooks/useParticulares', () => ({
  useParticulares: (opts: { search?: string }) => mockUseParticulares(opts),
}));

vi.mock('@/hooks/useUnits', () => ({
  useUnits: () => ({
    data: [],
    isLoading: false,
  }),
}));

vi.mock('@/hooks/useMutateParticular', () => ({
  useMutateParticular: () => ({
    createParticular: { mutateAsync: vi.fn(), isPending: false },
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

const buyer = {
  id: 'p-1',
  unit_id: 'u-1',
  dni: '30111222',
  full_name: 'García Juan',
  phone: '+54 11 1234-5678',
  email: 'juan@mail.com',
};

async function addEquipmentItem(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /agregar ítem/i }));
  // Change the item type to 'equipment' via the hidden native select Radix
  // renders (avoids the building_id requirement for key items).
  const hiddenSelects = document.querySelectorAll('select[aria-hidden="true"]');
  for (const sel of Array.from(hiddenSelects)) {
    const s = sel as HTMLSelectElement;
    if (Array.from(s.options).some((o) => o.value === 'equipment')) {
      await act(async () => {
        fireEvent.change(s, { target: { value: 'equipment' } });
      });
      return;
    }
  }
}

async function selectParticular(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByDisplayValue('particular'));
  await waitFor(() => {
    expect(screen.getByLabelText('Buscar particular')).toBeInTheDocument();
  });
  await user.type(screen.getByLabelText('Buscar particular'), 'garcia');
  await user.click(await screen.findByRole('option', { name: /garcía juan/i }));
}

describe('OrdenFormSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseParticulares.mockReturnValue({ data: [], isFetching: false });
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
    // Particular selector should not be visible
    expect(screen.queryByLabelText('Buscar particular')).not.toBeInTheDocument();
  });

  it('shows ParticularSelector after switching client_type radio to "particular"', async () => {
    const user = userEvent.setup();
    render(
      <OrdenFormSheet open={true} onOpenChange={vi.fn()} />,
      { wrapper: makeWrapper() },
    );

    const particularRadio = screen.getByDisplayValue('particular');
    await user.click(particularRadio);

    await waitFor(() => {
      expect(screen.getByLabelText('Buscar particular')).toBeInTheDocument();
    });
    // Administration select should not be visible anymore
    expect(screen.queryByLabelText(/administración \*/i)).not.toBeInTheDocument();
  });

  it('shows ParticularSelector only for particular client type', async () => {
    const user = userEvent.setup();
    render(
      <OrdenFormSheet open={true} onOpenChange={vi.fn()} />,
      { wrapper: makeWrapper() },
    );

    // Default administration: no selector
    expect(screen.queryByLabelText('Buscar particular')).not.toBeInTheDocument();

    await user.click(screen.getByDisplayValue('particular'));

    await waitFor(() => {
      expect(screen.getByLabelText('Buscar particular')).toBeInTheDocument();
    });
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

  it('blocks submit for particular client without selecting a particular', async () => {
    const user = userEvent.setup();
    render(
      <OrdenFormSheet open={true} onOpenChange={vi.fn()} />,
      { wrapper: makeWrapper() },
    );

    // Switch to particular
    const particularRadio = screen.getByDisplayValue('particular');
    await user.click(particularRadio);

    // Submit without selecting a particular
    const submitButton = screen.getByRole('button', { name: /guardar/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/seleccioná un particular/i)).toBeInTheDocument();
    });
    expect(mockCreateOrden).not.toHaveBeenCalled();
  });

  it('submits payload with particular_id and snapshot autofill for a particular client', async () => {
    mockUseParticulares.mockReturnValue({ data: [buyer], isFetching: false });
    mockCreateOrden.mockResolvedValue('new-order-id');

    const user = userEvent.setup();
    render(
      <OrdenFormSheet open={true} onOpenChange={vi.fn()} />,
      { wrapper: makeWrapper() },
    );

    // Search + select the buyer via the selector
    await selectParticular(user);

    // The bound selector shows the selected particular
    expect(screen.getByLabelText('Buscar particular')).toHaveValue('García Juan');

    // Add a non-key item to skip the building requirement
    await addEquipmentItem(user);

    const submitButton = screen.getByRole('button', { name: /guardar/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockCreateOrden).toHaveBeenCalledWith(
        expect.objectContaining({
          order: expect.objectContaining({
            client_type: 'particular',
            particular_id: 'p-1',
            particular_full_name: 'García Juan',
            particular_dni: '30111222',
            particular_phone: '+54 11 1234-5678',
            particular_email: 'juan@mail.com',
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
    mockUseParticulares.mockReturnValue({ data: [buyer], isFetching: false });
    mockCreateOrden.mockResolvedValue('new-order-id');

    const onOpenChange = vi.fn();
    render(
      <OrdenFormSheet open={true} onOpenChange={onOpenChange} />,
      { wrapper: makeWrapper() },
    );

    await selectParticular(user);
    await addEquipmentItem(user);

    const submitButton = screen.getByRole('button', { name: /guardar/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
