import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const mockCreateMutateAsync = vi.fn();
const mockUpdateMutateAsync = vi.fn();

vi.mock('@/hooks/useMutateUnit', () => ({
  useMutateUnit: () => ({
    createUnit: {
      mutateAsync: mockCreateMutateAsync,
      isPending: false,
    },
    updateUnit: {
      mutateAsync: mockUpdateMutateAsync,
      isPending: false,
    },
    deactivateUnit: {
      mutateAsync: vi.fn(),
      isPending: false,
    },
  }),
}));

import { UnitFormSheet } from '../UnitFormSheet';

const BUILDING_ID = 'b-1';

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe('UnitFormSheet', () => {
  const mockOnOpenChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateMutateAsync.mockResolvedValue({});
    mockUpdateMutateAsync.mockResolvedValue({});
  });

  it('building_id is not rendered in the create form', () => {
    render(
      <UnitFormSheet
        open={true}
        onOpenChange={mockOnOpenChange}
        buildingId={BUILDING_ID}
      />,
      { wrapper: makeWrapper() },
    );

    // No input with value or label containing "building" or building_id
    expect(screen.queryByDisplayValue(BUILDING_ID)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/building/i)).not.toBeInTheDocument();
  });

  it('is_administrative toggle is present', () => {
    render(
      <UnitFormSheet
        open={true}
        onOpenChange={mockOnOpenChange}
        buildingId={BUILDING_ID}
      />,
      { wrapper: makeWrapper() },
    );

    expect(screen.getByLabelText('Unidad administrativa')).toBeInTheDocument();
  });

  it('submits create with building_id from prop, not form', async () => {
    const user = userEvent.setup();

    render(
      <UnitFormSheet
        open={true}
        onOpenChange={mockOnOpenChange}
        buildingId={BUILDING_ID}
      />,
      { wrapper: makeWrapper() },
    );

    await user.type(screen.getByLabelText(/Número/i), '101');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      expect(mockCreateMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ building_id: BUILDING_ID, number: '101' }),
      );
    });
  });

  it('in edit mode, calls updateUnit with id (not building_id)', async () => {
    const user = userEvent.setup();
    const existingUnit = { id: 'u-42', number: '201', is_administrative: false };

    render(
      <UnitFormSheet
        open={true}
        onOpenChange={mockOnOpenChange}
        buildingId={BUILDING_ID}
        unit={existingUnit}
      />,
      { wrapper: makeWrapper() },
    );

    // Clear the number field and type a new one
    const numberInput = screen.getByLabelText(/Número/i);
    await user.clear(numberInput);
    await user.type(numberInput, '202');

    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      expect(mockUpdateMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'u-42', number: '202' }),
      );
    });

    // building_id should NOT be in updateUnit call
    const updateCall = mockUpdateMutateAsync.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(updateCall).not.toHaveProperty('building_id');
  });
});
