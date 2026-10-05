import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';
import { expectInvalidFieldWired } from '@/test/expectFieldErrorWiring';

vi.mock('@vitalock/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@vitalock/shared')>();
  return { ...actual, useAuthContext: () => ({ staff: { id: 's-1' } }) };
});
vi.mock('@/hooks/useMutateEquipmentUpdate', () => ({
  useMutateEquipmentUpdate: () => ({
    createEquipmentUpdate: { mutateAsync: vi.fn(), isPending: false },
  }),
}));
vi.mock('@/hooks/useStaff', () => ({ useStaff: () => ({ data: [] }) }));

import { EquipmentUpdateFormSheet } from '../EquipmentUpdateFormSheet';

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

function renderSheet() {
  return render(
    <EquipmentUpdateFormSheet
      open
      onOpenChange={vi.fn()}
      equipmentId="e-1"
      administrationId="a-1"
      buildingId="b-1"
      pendingActivate={[]}
      pendingDisable={[]}
      ticketId="t-1"
    />,
    { wrapper: makeWrapper() },
  );
}

describe('EquipmentUpdateFormSheet', () => {
  it('wires the oversize-file error to the file input (FormField)', async () => {
    const user = userEvent.setup();
    renderSheet();
    const file = new File(['x'], 'config.mdb');
    Object.defineProperty(file, 'size', { value: 51 * 1024 * 1024 });

    await user.upload(screen.getByLabelText(/archivo \.mdb/i), file);

    await waitFor(() => expectInvalidFieldWired());
    expect(screen.getByRole('alert')).toHaveTextContent('El archivo supera el límite de 50 MB.');
  });

  it('keeps the file input clean with no file chosen', () => {
    renderSheet();

    expect(screen.getByLabelText(/archivo \.mdb/i)).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
