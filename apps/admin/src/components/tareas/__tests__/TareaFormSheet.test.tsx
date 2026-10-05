import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';
import { expectInvalidFieldWired } from '@/test/expectFieldErrorWiring';

vi.mock('@/hooks/useMutateTarea', () => ({
  useMutateTarea: () => ({
    createTarea: { mutateAsync: vi.fn(), isPending: false },
    updateTarea: { mutateAsync: vi.fn(), isPending: false },
  }),
}));
vi.mock('@/hooks/useStaff', () => ({ useStaff: () => ({ data: [] }) }));
vi.mock('@/hooks/useAdministrations', () => ({ useAdministrations: () => ({ data: [] }) }));
vi.mock('@/hooks/useBuildings', () => ({ useBuildings: () => ({ data: [] }) }));
vi.mock('@/hooks/useUnits', () => ({ useUnits: () => ({ data: [] }) }));
vi.mock('@/hooks/useEquipment', () => ({ useEquipment: () => ({ data: [] }) }));

import { TareaFormSheet } from '../TareaFormSheet';

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe('TareaFormSheet', () => {
  it('wires the field error to its control on an invalid submit (FormField)', async () => {
    const user = userEvent.setup();
    render(<TareaFormSheet open onOpenChange={vi.fn()} />, { wrapper: makeWrapper() });

    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expectInvalidFieldWired());
  });

  it('keeps the controls clean before any submit', () => {
    render(<TareaFormSheet open onOpenChange={vi.fn()} />, { wrapper: makeWrapper() });

    expect(document.querySelector('[aria-invalid="true"]')).toBeNull();
  });
});
