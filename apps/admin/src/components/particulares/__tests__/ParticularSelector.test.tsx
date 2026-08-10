import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import type { ReactNode } from 'react';

const mockUseParticulares = vi.fn();

vi.mock('@/hooks/useParticulares', () => ({
  useParticulares: (opts: { search?: string }) => mockUseParticulares(opts),
}));

const mockDialogCreated = vi.fn();

vi.mock('../QuickParticularCreateDialog', () => ({
  QuickParticularCreateDialog: ({
    open,
    onOpenChange,
    onCreated,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreated: (particular: unknown) => void;
  }) =>
    open ? (
      <div data-testid="create-dialog">
        <button
          type="button"
          onClick={() => {
            onCreated(mockDialogCreated());
            onOpenChange(false);
          }}
        >
          Guardar mock
        </button>
      </div>
    ) : null,
}));

import { ParticularSelector } from '../ParticularSelector';
import type { ParticularRow } from '@/hooks/useParticulares';

const garcia = {
  id: 'p-1',
  unit_id: 'u-1',
  dni: '30111222',
  full_name: 'García Juan',
  phone: null,
  email: null,
};

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

describe('ParticularSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseParticulares.mockReturnValue({ data: [], isFetching: false });
  });

  it('debounced search by name reaches useParticulares and shows matches', async () => {
    const user = userEvent.setup();
    mockUseParticulares.mockReturnValue({ data: [garcia], isFetching: false });

    render(<ParticularSelector onChange={vi.fn()} />, { wrapper: makeWrapper() });

    await user.type(screen.getByRole('combobox'), 'garc');

    await waitFor(() => {
      expect(mockUseParticulares).toHaveBeenLastCalledWith({ search: 'garc' });
    });

    expect(
      await screen.findByRole('option', { name: /garcía juan/i }),
    ).toBeInTheDocument();
  });

  it('binds the selected particular through onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    mockUseParticulares.mockReturnValue({ data: [garcia], isFetching: false });

    function ControlledSelector() {
      const [value, setValue] = React.useState<ParticularRow | null>(null);
      return (
        <ParticularSelector
          value={value}
          onChange={(p) => {
            setValue(p);
            onChange(p);
          }}
        />
      );
    }

    render(<ControlledSelector />, { wrapper: makeWrapper() });

    await user.type(screen.getByRole('combobox'), 'garc');
    await user.click(await screen.findByRole('option', { name: /garcía juan/i }));

    expect(onChange).toHaveBeenCalledWith(garcia);
    expect(screen.getByRole('combobox')).toHaveValue('García Juan');
  });

  it('shows empty state on no match and opens the create dialog from it', async () => {
    const user = userEvent.setup();

    render(<ParticularSelector onChange={vi.fn()} />, { wrapper: makeWrapper() });

    await user.type(screen.getByRole('combobox'), 'zzz');

    expect(
      await screen.findByText('No se encontraron resultados'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /crear particular/i }));
    expect(screen.getByTestId('create-dialog')).toBeInTheDocument();
  });

  it('emits the created particular through onChange when creation succeeds', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    mockDialogCreated.mockReturnValue(garcia);

    render(<ParticularSelector onChange={onChange} />, { wrapper: makeWrapper() });

    await user.type(screen.getByRole('combobox'), 'zzz');
    await screen.findByText('No se encontraron resultados');
    await user.click(screen.getByRole('button', { name: /crear particular/i }));
    await user.click(await screen.findByRole('button', { name: /guardar mock/i }));

    expect(onChange).toHaveBeenCalledWith(garcia);
  });

  it('shows the bound value and clears it via the quitar button', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<ParticularSelector value={garcia} onChange={onChange} />, {
      wrapper: makeWrapper(),
    });

    expect(screen.getByRole('combobox')).toHaveValue('García Juan');

    await user.click(screen.getByRole('button', { name: /quitar particular/i }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('does not open the dropdown while the query is empty', () => {
    render(<ParticularSelector onChange={vi.fn()} />, { wrapper: makeWrapper() });

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
