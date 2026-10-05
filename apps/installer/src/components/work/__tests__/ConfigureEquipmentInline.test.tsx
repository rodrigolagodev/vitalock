import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
    category: 'replace_equipment',
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
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
});

async function openSheet(label = /configurar equipo/i) {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: label }));
  return user;
}

describe('ConfigureEquipmentInline — empty state', () => {
  it('keeps the form out of the page until the trigger opens a bottom sheet', async () => {
    render(<ConfigureEquipmentInline ticket={makeTicket()} />, { wrapper: makeWrapper() });
    expect(screen.queryByLabelText(/número de serie/i)).not.toBeInTheDocument();
    await openSheet();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText(/número de serie/i)).toBeInTheDocument();
  });

  it('shows the empty form with help text and product placeholder', async () => {
    render(<ConfigureEquipmentInline ticket={makeTicket()} />, {
      wrapper: makeWrapper(),
    });
    await openSheet();
    expect(screen.getByLabelText(/número de serie/i)).toBeInTheDocument();
    expect(screen.getByText(/después vas a poder finalizar/i)).toBeInTheDocument();
    const model = screen.getByLabelText(/modelo/i) as HTMLInputElement;
    expect(model.placeholder).toBe('Smart Lock Pro v3');
  });

  it('rejects empty serial and does not call the mutation', async () => {
    render(<ConfigureEquipmentInline ticket={makeTicket()} />, {
      wrapper: makeWrapper(),
    });
    const user = await openSheet();
    await user.click(screen.getByRole('button', { name: /guardar equipo/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/número de serie es obligatorio/i);
    expect(screen.getByLabelText(/número de serie/i)).toHaveAttribute('aria-invalid', 'true');
    expect(configureMutate).not.toHaveBeenCalled();
  });

  it('submits serial + null model when the model field is left blank', async () => {
    render(<ConfigureEquipmentInline ticket={makeTicket()} />, {
      wrapper: makeWrapper(),
    });
    const user = await openSheet();
    await user.type(screen.getByLabelText(/número de serie/i), 'SN-XYZ');
    await user.click(screen.getByRole('button', { name: /guardar equipo/i }));
    expect(configureMutate).toHaveBeenCalledWith(
      { ticketId: 'ticket-1', newSerial: 'SN-XYZ', newModel: null },
      expect.any(Object),
    );
  });
});

// 5.3 RED — renders correct heading for category='install_equipment'; no checkbox affordance shown
describe('ConfigureEquipmentInline — install_equipment category', () => {
  it('renders heading for installation ticket', () => {
    render(
      <ConfigureEquipmentInline
        ticket={makeTicket({ category: 'install_equipment', title: 'Instalar equipo' })}
      />,
      { wrapper: makeWrapper() },
    );
    expect(screen.getByText(/equipo a instalar/i)).toBeInTheDocument();
  });

  it('submits configure payload for installation ticket', async () => {
    render(<ConfigureEquipmentInline ticket={makeTicket({ category: 'install_equipment' })} />, {
      wrapper: makeWrapper(),
    });
    const user = await openSheet();
    await user.type(screen.getByLabelText(/número de serie/i), 'SN-INSTALL-01');
    await user.click(screen.getByRole('button', { name: /guardar equipo/i }));
    expect(configureMutate).toHaveBeenCalledWith(
      { ticketId: 'ticket-1', newSerial: 'SN-INSTALL-01', newModel: null },
      expect.any(Object),
    );
  });

  it('does not show a checkbox affordance for installation tickets', () => {
    render(<ConfigureEquipmentInline ticket={makeTicket({ category: 'install_equipment' })} />, {
      wrapper: makeWrapper(),
    });
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
});

describe('ConfigureEquipmentInline — touch targets', () => {
  it('renders the trigger and the submit button at the 44px default control height', async () => {
    render(<ConfigureEquipmentInline ticket={makeTicket()} />, { wrapper: makeWrapper() });
    const trigger = screen.getByRole('button', { name: /configurar equipo/i });
    expect(trigger).toHaveClass('h-control-md');
    await openSheet();
    const submit = screen.getByRole('button', { name: /guardar equipo/i });
    expect(submit).toHaveClass('h-control-md');
    expect(submit).not.toHaveClass('h-control-sm');
  });
});

describe('ConfigureEquipmentInline — touch-safe inputs', () => {
  it('labels the serial field and suppresses autocorrection', async () => {
    render(<ConfigureEquipmentInline ticket={makeTicket()} />, { wrapper: makeWrapper() });
    await openSheet();
    const serial = screen.getByLabelText('Número de serie');
    expect(serial).toHaveAttribute('autocapitalize', 'characters');
    expect(serial).toHaveAttribute('autocorrect', 'off');
    expect(serial).toHaveAttribute('spellcheck', 'false');
  });

  it('keeps both inputs at 16px (no text-sm or text-xs overrides)', async () => {
    render(<ConfigureEquipmentInline ticket={makeTicket()} />, { wrapper: makeWrapper() });
    await openSheet();
    for (const input of [
      screen.getByLabelText('Número de serie'),
      screen.getByLabelText('Modelo'),
    ]) {
      expect(input).not.toHaveClass('text-sm');
      expect(input).not.toHaveClass('text-xs');
    }
  });
});

describe('ConfigureEquipmentInline — offline and sheet lifecycle', () => {
  it('disables Guardar equipo offline and shows the reason', async () => {
    render(<ConfigureEquipmentInline ticket={makeTicket()} />, { wrapper: makeWrapper() });
    const user = await openSheet();
    await user.type(screen.getByLabelText('Número de serie'), 'SN-1');
    act(() => {
      Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false });
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByRole('button', { name: /guardar equipo/i })).toBeDisabled();
    expect(screen.getByText('Sin conexión')).toBeInTheDocument();
  });

  it('closes the sheet after a successful save', async () => {
    configureMutate.mockImplementation((_vars, opts?: { onSuccess?: () => void }) =>
      opts?.onSuccess?.(),
    );
    render(<ConfigureEquipmentInline ticket={makeTicket()} />, { wrapper: makeWrapper() });
    const user = await openSheet();
    await user.type(screen.getByLabelText('Número de serie'), 'SN-1');
    await user.click(screen.getByRole('button', { name: /guardar equipo/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('closes via Cerrar without calling the mutation', async () => {
    render(<ConfigureEquipmentInline ticket={makeTicket()} />, { wrapper: makeWrapper() });
    const user = await openSheet();
    await user.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(configureMutate).not.toHaveBeenCalled();
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

  it('opens the sheet prefilled from the Editar button', async () => {
    render(
      <ConfigureEquipmentInline
        ticket={makeTicket({ pending_new_serial: 'SN-999', pending_new_model: 'Custom Model' })}
      />,
      { wrapper: makeWrapper() },
    );
    await openSheet(/editar/i);
    expect(screen.getByLabelText('Número de serie')).toHaveValue('SN-999');
    expect(screen.getByLabelText('Modelo')).toHaveValue('Custom Model');
  });
});
