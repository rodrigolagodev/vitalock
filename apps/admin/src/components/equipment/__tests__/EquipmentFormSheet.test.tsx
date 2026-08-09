import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

// Mock useMutateEquipment
const mockCreateEquipment = { mutateAsync: vi.fn(), isPending: false };
const mockUpdateEquipment = { mutateAsync: vi.fn(), isPending: false };
const mockUpdateStatus = { mutateAsync: vi.fn(), isPending: false };
const mockUseMutateEquipment = vi.fn().mockReturnValue({
  createEquipment: mockCreateEquipment,
  updateEquipment: mockUpdateEquipment,
  updateStatus: mockUpdateStatus,
});
vi.mock('@/hooks/useMutateEquipment', () => ({
  useMutateEquipment: (...args: unknown[]) => mockUseMutateEquipment(...args),
}));

// Mock useDecommissionImpact (used inside DecommissionDialog)
vi.mock('@/hooks/useDecommissionImpact', () => ({
  useDecommissionImpact: () => ({ data: 0, isLoading: false, isSuccess: true }),
}));

import { EquipmentFormSheet } from '../EquipmentFormSheet';
import type { EquipmentRow } from '@/hooks/useEquipment';

const BUILDING_ID = 'bld-form';

const mockEquipment: EquipmentRow = {
  id: 'eq-form-1',
  model: 'Lock Pro',
  serial_number: 'SN-IMMUTABLE',
  status: 'active',
  installed_at: '2024-06-01',
  building_id: BUILDING_ID,
};

const deadEquipment: EquipmentRow = {
  ...mockEquipment,
  id: 'eq-dead',
  status: 'dead',
};

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

function renderSheet({
  equipment = undefined,
  open = true,
}: {
  equipment?: EquipmentRow | null;
  open?: boolean;
} = {}) {
  const Wrapper = makeWrapper();
  return render(
    <Wrapper>
      <EquipmentFormSheet
        open={open}
        onOpenChange={vi.fn()}
        buildingId={BUILDING_ID}
        equipment={equipment}
      />
    </Wrapper>,
  );
}

describe('EquipmentFormSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseMutateEquipment.mockReturnValue({
      createEquipment: mockCreateEquipment,
      updateEquipment: mockUpdateEquipment,
      updateStatus: mockUpdateStatus,
    });
  });

  describe('create mode', () => {
    it('renders model, serial_number, installed_at fields', () => {
      renderSheet();
      expect(screen.getByLabelText(/Modelo/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Número de serie/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Fecha de instalación/i)).toBeInTheDocument();
    });

    it('replaces_equipment_id field is absent from create form', () => {
      renderSheet();
      // No field labeled replaces or related
      expect(screen.queryByLabelText(/reemplaza/i)).not.toBeInTheDocument();
      expect(screen.queryByDisplayValue(/replaces_equipment_id/i)).not.toBeInTheDocument();
    });

    it('building_id field is NOT rendered in create form (pre-populated from prop)', () => {
      renderSheet();
      // building_id should not appear as an editable input
      const inputs = screen.getAllByRole('textbox');
      const inputValues = inputs.map((el) => (el as HTMLInputElement).value);
      // BUILDING_ID should not be in any text input value (it's passed as a prop, not rendered)
      expect(inputValues).not.toContain(BUILDING_ID);
    });
  });

  describe('edit mode', () => {
    it('shows model as editable input', () => {
      renderSheet({ equipment: mockEquipment });
      const modelInput = screen.getByLabelText(/Modelo/i);
      expect(modelInput).not.toHaveAttribute('readOnly');
      expect(modelInput).toHaveValue('Lock Pro');
    });

    it('serial_number is displayed as readonly (not editable)', () => {
      renderSheet({ equipment: mockEquipment });
      // Find the input with the serial number value
      const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
      const serialInput = inputs.find((el) => el.value === 'SN-IMMUTABLE');
      expect(serialInput).toBeDefined();
      expect(serialInput).toHaveAttribute('readOnly');
    });

    it('installed_at is displayed as readonly', () => {
      renderSheet({ equipment: mockEquipment });
      const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
      const installedInput = inputs.find((el) => el.value === '2024-06-01');
      expect(installedInput).toBeDefined();
      expect(installedInput).toHaveAttribute('readOnly');
    });

    it('building_id is displayed as readonly', () => {
      renderSheet({ equipment: mockEquipment });
      const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
      const buildingInput = inputs.find((el) => el.value === BUILDING_ID);
      expect(buildingInput).toBeDefined();
      expect(buildingInput).toHaveAttribute('readOnly');
    });

    it('replaces_equipment_id is NOT present as editable field in edit form', () => {
      renderSheet({ equipment: mockEquipment });
      // replaces_equipment_id should never appear as an editable input
      expect(screen.queryByLabelText(/replaces/i)).not.toBeInTheDocument();
    });
  });

  describe('dead status', () => {
    it('edit form for dead equipment has submit button disabled', () => {
      renderSheet({ equipment: deadEquipment });
      const saveBtn = screen.getByRole('button', { name: /Guardar/i });
      expect(saveBtn).toBeDisabled();
    });

    it('status shows dead equipment label in the select trigger', () => {
      renderSheet({ equipment: deadEquipment });
      // The select trigger span shows "Dado de baja" (may appear multiple times due to radix hidden option)
      const matches = screen.getAllByText('Dado de baja');
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });
  });
});
