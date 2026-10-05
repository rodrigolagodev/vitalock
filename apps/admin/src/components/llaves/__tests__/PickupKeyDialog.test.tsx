import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';
import { expectInvalidFieldWired } from '@/test/expectFieldErrorWiring';
import type { KeyOrderItemRow } from '@/hooks/useKeyOrder';

vi.mock('@/hooks/useMutateKey', () => ({
  useMutateKey: () => ({ recordPickup: { mutateAsync: vi.fn(), isPending: false } }),
}));

import { PickupKeyDialog } from '../PickupKeyDialog';

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

const item = {
  id: 'it-1',
  order_id: 'o-1',
  item_type: 'key',
  quantity: 1,
  description: null,
  status: 'configured',
  building_id: 'b-1',
  unit_id: null,
  unit_price: 100,
  product_id: null,
  produced_key_id: 'k-1',
  pickup_particular_id: null,
  pickup_particulares: null,
  rfid_keys: null,
} as KeyOrderItemRow;

describe('PickupKeyDialog', () => {
  it('wires the field error to its control on an invalid submit (FormField)', async () => {
    const user = userEvent.setup();
    render(<PickupKeyDialog open onOpenChange={vi.fn()} item={item} orderId="o-1" />, {
      wrapper: makeWrapper(),
    });

    await user.click(screen.getByRole('button', { name: 'Registrar retiro' }));

    await waitFor(() => expectInvalidFieldWired());
  });

  it('keeps the controls clean before any submit', () => {
    render(<PickupKeyDialog open onOpenChange={vi.fn()} item={item} orderId="o-1" />, {
      wrapper: makeWrapper(),
    });

    expect(document.querySelector('[aria-invalid="true"]')).toBeNull();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
