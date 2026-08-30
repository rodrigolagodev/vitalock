import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';
import type { AssignedTicket } from '@/hooks/useAssignedTickets';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const configureMutate = vi.fn();
vi.mock('@/hooks/useConfigureTechnicalTicketEquipment', () => ({
  useConfigureTechnicalTicketEquipment: () => ({
    mutate: configureMutate,
    isPending: false,
  }),
}));

import { ConfigureEquipmentInline } from '../ConfigureEquipmentInline';

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function makeTicket(overrides: Partial<AssignedTicket> = {}): AssignedTicket {
  return {
    id: 'ticket-1',
    title: 'Reemplazar equipo',
    description: 'Reemplazar equipo',
    status: 'open',
    category: 'equipment_replacement',
    opened_at: '2026-08-26T00:00:00Z',
    building: {
      id: 'b-1',
      name: 'Torre Norte',
      address: null,
      city: null,
      administration: { id: 'a-1', company_name: 'Admin S.A.' },
    },
    pending_new_serial: null,
    pending_new_model: null,
    intended_product_name: 'Smart Lock Pro v3',
    ...overrides,
  };
}

beforeEach(() => {
  configureMutate.mockReset();
});

describe('ConfigureEquipmentInline — empty state', () => {
  it('shows the empty form with help text and product placeholder', () => {
    render(<ConfigureEquipmentInline ticket={makeTicket()} />, {
      wrapper: makeWrapper(),
    });
    expect(screen.getByLabelText(/número de serie/i)).toBeInTheDocument();
    expect(screen.getByText(/después vas a poder finalizar/i)).toBeInTheDocument();
    const model = screen.getByLabelText(/modelo/i) as HTMLInputElement;
    expect(model.placeholder).toBe('Smart Lock Pro v3');
  });

  it('rejects empty serial and does not call the mutation', async () => {
    const user = userEvent.setup();
    render(<ConfigureEquipmentInline ticket={makeTicket()} />, {
      wrapper: makeWrapper(),
    });
    await user.click(screen.getByRole('button', { name: /guardar equipo/i }));
    expect(await screen.findByText(/número de serie es obligatorio/i)).toBeInTheDocument();
    expect(configureMutate).not.toHaveBeenCalled();
  });

  it('submits serial + null model when the model field is left blank', async () => {
    const user = userEvent.setup();
    render(<ConfigureEquipmentInline ticket={makeTicket()} />, {
      wrapper: makeWrapper(),
    });
    await user.type(screen.getByLabelText(/número de serie/i), 'SN-XYZ');
    await user.click(screen.getByRole('button', { name: /guardar equipo/i }));
    expect(configureMutate).toHaveBeenCalledWith(
      { ticketId: 'ticket-1', newSerial: 'SN-XYZ', newModel: null },
      expect.any(Object),
    );
  });
});

describe('ConfigureEquipmentInline — configured state', () => {
  it('shows read-only serial/model with an "Editar" button', () => {
    render(
      <ConfigureEquipmentInline
        ticket={makeTicket({
          pending_new_serial: 'SN-999',
          pending_new_model: 'Custom Model',
        })}
      />,
      { wrapper: makeWrapper() },
    );
    expect(screen.getByText('SN-999')).toBeInTheDocument();
    expect(screen.getByText('Custom Model')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /editar/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /guardar equipo/i })).not.toBeInTheDocument();
  });

  it('falls back to the product name when pending_new_model is null', () => {
    render(
      <ConfigureEquipmentInline
        ticket={makeTicket({ pending_new_serial: 'SN-1', pending_new_model: null })}
      />,
      { wrapper: makeWrapper() },
    );
    expect(screen.getByText('Smart Lock Pro v3')).toBeInTheDocument();
  });
});
