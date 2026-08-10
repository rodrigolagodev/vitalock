import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import type { ReactNode } from 'react';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const mockCreateUnit = vi.fn();

vi.mock('@/hooks/useMutateUnit', () => ({
  useMutateUnit: () => ({
    createUnit: {
      mutateAsync: mockCreateUnit,
      isPending: false,
    },
    updateUnit: { mutateAsync: vi.fn(), isPending: false },
    deactivateUnit: { mutateAsync: vi.fn(), isPending: false },
  }),
}));

vi.mock('@/hooks/mapMutationError', () => ({
  toastMutationError: vi.fn(),
}));

import { QuickUnitCreateDialog } from '../QuickUnitCreateDialog';

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

describe('QuickUnitCreateDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders dialog title when open', () => {
    render(
      <QuickUnitCreateDialog
        open={true}
        onOpenChange={vi.fn()}
        buildingId="building-1"
        onCreated={vi.fn()}
      />,
      { wrapper: makeWrapper() },
    );

    expect(screen.getByText('Nueva unidad')).toBeInTheDocument();
  });

  it('does not render dialog content when closed', () => {
    render(
      <QuickUnitCreateDialog
        open={false}
        onOpenChange={vi.fn()}
        buildingId="building-1"
        onCreated={vi.fn()}
      />,
      { wrapper: makeWrapper() },
    );

    expect(screen.queryByText('Nueva unidad')).not.toBeInTheDocument();
  });

  it('blocks submit when number is empty and shows error', async () => {
    const user = userEvent.setup();
    render(
      <QuickUnitCreateDialog
        open={true}
        onOpenChange={vi.fn()}
        buildingId="building-1"
        onCreated={vi.fn()}
      />,
      { wrapper: makeWrapper() },
    );

    const submitButton = screen.getByRole('button', { name: /crear/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/el número es obligatorio/i)).toBeInTheDocument();
    });
    expect(mockCreateUnit).not.toHaveBeenCalled();
  });

  it('calls createUnit with correct payload on valid submit', async () => {
    const user = userEvent.setup();
    mockCreateUnit.mockResolvedValue({ id: 'new-unit-id', number: '101' });

    render(
      <QuickUnitCreateDialog
        open={true}
        onOpenChange={vi.fn()}
        buildingId="building-1"
        onCreated={vi.fn()}
      />,
      { wrapper: makeWrapper() },
    );

    await user.type(screen.getByLabelText(/número/i), '101');
    await user.click(screen.getByRole('button', { name: /crear/i }));

    await waitFor(() => {
      expect(mockCreateUnit).toHaveBeenCalledWith(
        expect.objectContaining({
          building_id: 'building-1',
          number: '101',
          is_administrative: false,
        }),
      );
    });
  });

  it('invokes onCreated with the new unit id on success', async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    mockCreateUnit.mockResolvedValue({ id: 'new-unit-id', number: '202' });

    render(
      <QuickUnitCreateDialog
        open={true}
        onOpenChange={vi.fn()}
        buildingId="building-1"
        onCreated={onCreated}
      />,
      { wrapper: makeWrapper() },
    );

    await user.type(screen.getByLabelText(/número/i), '202');
    await user.click(screen.getByRole('button', { name: /crear/i }));

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith('new-unit-id');
    });
  });

  it('closes dialog after successful creation', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    mockCreateUnit.mockResolvedValue({ id: 'new-unit-id', number: '303' });

    render(
      <QuickUnitCreateDialog
        open={true}
        onOpenChange={onOpenChange}
        buildingId="building-1"
        onCreated={vi.fn()}
      />,
      { wrapper: makeWrapper() },
    );

    await user.type(screen.getByLabelText(/número/i), '303');
    await user.click(screen.getByRole('button', { name: /crear/i }));

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
