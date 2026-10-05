import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';
import { expectInvalidFieldWired } from '@/test/expectFieldErrorWiring';
import type { EquipmentRow } from '@/hooks/useEquipment';

vi.mock('@/hooks/useReplaceEquipment', () => ({
  useReplaceEquipment: () => ({ replaceEquipment: { mutateAsync: vi.fn(), isPending: false } }),
}));

import { ReplaceEquipmentDialog } from '../ReplaceEquipmentDialog';

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

const equipment = {
  id: 'e-1',
  serial_number: 'SN-1',
  model: 'Lock',
  status: 'active',
} as unknown as EquipmentRow;

describe('ReplaceEquipmentDialog', () => {
  it('wires the field error to its control on an invalid submit (FormField)', async () => {
    const user = userEvent.setup();
    render(
      <ReplaceEquipmentDialog open onOpenChange={vi.fn()} equipment={equipment} buildingId="b-1" />,
      { wrapper: makeWrapper() },
    );

    await user.click(screen.getByRole('button', { name: 'Confirmar reemplazo' }));

    await waitFor(() => expectInvalidFieldWired());
  });

  it('keeps the controls clean before any submit', () => {
    render(
      <ReplaceEquipmentDialog open onOpenChange={vi.fn()} equipment={equipment} buildingId="b-1" />,
      { wrapper: makeWrapper() },
    );

    expect(document.querySelector('[aria-invalid="true"]')).toBeNull();
  });
});
