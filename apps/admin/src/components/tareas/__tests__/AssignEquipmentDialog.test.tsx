import { afterEach, describe, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';
import { expectInvalidFieldWired } from '@/test/expectFieldErrorWiring';

const { equipmentHolder } = vi.hoisted(() => ({
  equipmentHolder: { current: [] as Array<Record<string, unknown>> },
}));

vi.mock('@/hooks/useEquipment', () => ({
  useEquipment: () => ({ data: equipmentHolder.current }),
}));
vi.mock('@/hooks/useProducts', () => ({ useProducts: () => ({ data: [] }) }));
vi.mock('@/hooks/useMutateTicketEquipment', () => ({
  useMutateTicketEquipment: () => ({
    assignExistingEquipment: { mutateAsync: vi.fn(), isPending: false },
    createAndAssignEquipment: { mutateAsync: vi.fn(), isPending: false },
  }),
}));
vi.mock('@/hooks/useResolveEquipmentInstallation', () => ({
  useResolveEquipmentInstallation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/useResolveEquipmentReplacement', () => ({
  useResolveEquipmentReplacement: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { AssignEquipmentDialog } from '../AssignEquipmentDialog';

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

function renderDialog(category: 'install_equipment' | 'replace_equipment') {
  return render(
    <AssignEquipmentDialog
      open
      onOpenChange={vi.fn()}
      ticketId="t-1"
      buildingId="b-1"
      category={category}
    />,
    { wrapper: makeWrapper() },
  );
}

describe('AssignEquipmentDialog', () => {
  afterEach(() => {
    equipmentHolder.current = [];
  });

  it('wires the field error to its control on an invalid submit (create mode)', async () => {
    const user = userEvent.setup();
    renderDialog('install_equipment');

    await user.click(screen.getByRole('button', { name: 'Crear y asignar' }));

    await waitFor(() => expectInvalidFieldWired());
  });

  it('wires the field error to its control on an invalid submit (replace mode)', async () => {
    const user = userEvent.setup();
    equipmentHolder.current = [
      { id: 'e-1', serial_number: 'SN-1', model: 'Lock', status: 'active' },
    ];
    renderDialog('replace_equipment');

    await user.click(screen.getByRole('button', { name: 'Reemplazar' }));

    await waitFor(() => expectInvalidFieldWired());
  });
});
