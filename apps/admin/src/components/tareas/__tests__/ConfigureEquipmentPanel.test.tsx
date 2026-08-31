import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';
import type { TareaDetailRow } from '@/hooks/useTarea';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const configureMutate = vi.fn();
vi.mock('@/hooks/useConfigureTechnicalTicketEquipment', () => ({
  useConfigureTechnicalTicketEquipment: () => ({
    mutateAsync: configureMutate,
    isPending: false,
  }),
}));

import { ConfigureEquipmentPanel } from '../ConfigureEquipmentPanel';

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function makeTarea(overrides: Partial<TareaDetailRow> = {}): TareaDetailRow {
  return {
    id: 'ticket-1',
    ticket_number: 'TKT-1',
    category: 'equipment_replacement',
    description: 'Reemplazar equipo',
    status: 'open',
    building_id: 'b-1',
    building: null,
    equipment_id: 'eq-old',
    assigned_to_staff_id: null,
    assigned_to_name: null,
    opened_by_staff_id: null,
    opened_by_name: null,
    opened_at: '2026-08-26T12:00:00Z',
    updated_at: '2026-08-26T12:00:00Z',
    resolution_notes: null,
    cancellation_reason: null,
    notes: null,
    equipment: null,
    pending_new_serial: null,
    pending_new_model: null,
    technical_order_item_id: 'toi-1',
    intended_product_name: 'Smart Lock Pro v3',
    ...overrides,
  };
}

beforeEach(() => {
  configureMutate.mockReset();
  configureMutate.mockResolvedValue(undefined);
});

describe('ConfigureEquipmentPanel — empty state', () => {
  it('renders serial input + help text and no "Editar" button', () => {
    render(<ConfigureEquipmentPanel tarea={makeTarea()} />, {
      wrapper: makeWrapper(),
    });
    expect(screen.getByLabelText(/número de serie/i)).toBeInTheDocument();
    expect(screen.getByText(/pasa a "en curso"/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /editar/i })).not.toBeInTheDocument();
  });

  it('uses the linked product name as the model placeholder', () => {
    render(<ConfigureEquipmentPanel tarea={makeTarea()} />, {
      wrapper: makeWrapper(),
    });
    const model = screen.getByLabelText(/modelo/i) as HTMLInputElement;
    expect(model.placeholder).toBe('Smart Lock Pro v3');
  });

  it('submits serial (and empty model as null) via the configure mutation', async () => {
    const user = userEvent.setup();
    render(<ConfigureEquipmentPanel tarea={makeTarea()} />, {
      wrapper: makeWrapper(),
    });

    await user.type(screen.getByLabelText(/número de serie/i), 'SN-NEW-001');
    await user.click(screen.getByRole('button', { name: /guardar equipo/i }));

    expect(configureMutate).toHaveBeenCalledWith({
      ticketId: 'ticket-1',
      newSerial: 'SN-NEW-001',
      newModel: null,
    });
  });

  it('rejects an empty serial with a validation error', async () => {
    const user = userEvent.setup();
    render(<ConfigureEquipmentPanel tarea={makeTarea()} />, {
      wrapper: makeWrapper(),
    });

    await user.click(screen.getByRole('button', { name: /guardar equipo/i }));

    expect(await screen.findByText(/el número de serie es obligatorio/i)).toBeInTheDocument();
    expect(configureMutate).not.toHaveBeenCalled();
  });
});

// 5.1 RED — category='installation' renders panel heading without TS error
describe('ConfigureEquipmentPanel — installation category', () => {
  it('renders panel heading for installation ticket without error', () => {
    render(
      <ConfigureEquipmentPanel
        tarea={makeTarea({ category: 'installation', description: 'Instalar equipo' })}
      />,
      { wrapper: makeWrapper() },
    );
    expect(screen.getByText(/configurar equipo a instalar/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/número de serie/i)).toBeInTheDocument();
  });
});

describe('ConfigureEquipmentPanel — configured state', () => {
  it('shows the stored serial and model in read-only view with an "Editar" button', () => {
    render(
      <ConfigureEquipmentPanel
        tarea={makeTarea({
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
      <ConfigureEquipmentPanel
        tarea={makeTarea({
          pending_new_serial: 'SN-001',
          pending_new_model: null,
        })}
      />,
      { wrapper: makeWrapper() },
    );
    expect(screen.getByText('Smart Lock Pro v3')).toBeInTheDocument();
  });

  it('reveals the pre-filled form when "Editar" is clicked', async () => {
    const user = userEvent.setup();
    render(
      <ConfigureEquipmentPanel
        tarea={makeTarea({ pending_new_serial: 'SN-999', pending_new_model: 'Custom Model' })}
      />,
      { wrapper: makeWrapper() },
    );

    await user.click(screen.getByRole('button', { name: /editar/i }));

    const serial = screen.getByLabelText(/número de serie/i) as HTMLInputElement;
    const model = screen.getByLabelText(/modelo/i) as HTMLInputElement;
    expect(serial.value).toBe('SN-999');
    expect(model.value).toBe('Custom Model');
    expect(screen.getByRole('button', { name: /cancelar/i })).toBeInTheDocument();
  });
});
