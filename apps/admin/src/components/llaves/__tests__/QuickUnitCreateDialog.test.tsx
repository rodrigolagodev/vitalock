import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';
import { expectInvalidFieldWired } from '@/test/expectFieldErrorWiring';

vi.mock('@/hooks/useMutateUnit', () => ({
  useMutateUnit: () => ({ createUnit: { mutateAsync: vi.fn(), isPending: false } }),
}));

import { QuickUnitCreateDialog } from '../QuickUnitCreateDialog';

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe('QuickUnitCreateDialog', () => {
  it('wires the field error to its control on an invalid submit (FormField)', async () => {
    const user = userEvent.setup();
    render(
      <QuickUnitCreateDialog open onOpenChange={vi.fn()} buildingId="b-1" onCreated={vi.fn()} />,
      { wrapper: makeWrapper() },
    );

    await user.click(screen.getByRole('button', { name: 'Crear' }));

    await waitFor(() => expectInvalidFieldWired());
    expect(screen.getByLabelText(/número/i)).toHaveAttribute('aria-invalid', 'true');
  });

  it('keeps the control clean before any submit', () => {
    render(
      <QuickUnitCreateDialog open onOpenChange={vi.fn()} buildingId="b-1" onCreated={vi.fn()} />,
      { wrapper: makeWrapper() },
    );

    expect(screen.getByLabelText(/número/i)).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
