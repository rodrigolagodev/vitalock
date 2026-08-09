import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

// Mock useDecommissionImpact
const mockUseDecommissionImpact = vi.fn();
vi.mock('@/hooks/useDecommissionImpact', () => ({
  useDecommissionImpact: (...args: unknown[]) => mockUseDecommissionImpact(...args),
}));

// Mock useMutateEquipment is NOT needed here — DecommissionDialog takes onConfirm as prop

import { DecommissionDialog } from '../DecommissionDialog';

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

const EQUIPMENT_ID = 'eq-decomm';

function renderDialog({
  open = true,
  onOpenChange = vi.fn(),
  onConfirm = vi.fn(),
  isPending = false,
  impactCount = 2,
  impactLoading = false,
}: {
  open?: boolean;
  onOpenChange?: ReturnType<typeof vi.fn>;
  onConfirm?: ReturnType<typeof vi.fn>;
  isPending?: boolean;
  impactCount?: number;
  impactLoading?: boolean;
} = {}) {
  mockUseDecommissionImpact.mockReturnValue({
    data: impactCount,
    isLoading: impactLoading,
    isSuccess: !impactLoading,
  });

  const Wrapper = makeWrapper();
  return render(
    <Wrapper>
      <DecommissionDialog
        open={open}
        onOpenChange={onOpenChange}
        equipmentId={EQUIPMENT_ID}
        onConfirm={onConfirm}
        isPending={isPending}
      />
    </Wrapper>,
  );
}

describe('DecommissionDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows impact count from useDecommissionImpact', () => {
    renderDialog({ impactCount: 3 });
    expect(screen.getByText(/3/)).toBeInTheDocument();
    expect(screen.getByText(/autorizaciones pendientes se cerrarán/)).toBeInTheDocument();
  });

  it('shows singular label when impact count is 1', () => {
    renderDialog({ impactCount: 1 });
    expect(screen.getByText(/1/)).toBeInTheDocument();
    expect(screen.getByText(/autorización pendiente se cerrará/)).toBeInTheDocument();
  });

  it('shows loading state while impact is loading', () => {
    renderDialog({ impactLoading: true, impactCount: 0 });
    expect(screen.getByText(/Calculando impacto/)).toBeInTheDocument();
  });

  it('confirm button triggers onConfirm with correct payload', async () => {
    const onConfirm = vi.fn();
    renderDialog({ impactCount: 0, onConfirm });

    const reasonInput = screen.getByLabelText(/Motivo de baja/i);
    await userEvent.type(reasonInput, 'Device broken');

    const confirmBtn = screen.getByRole('button', { name: /Confirmar baja/i });
    await userEvent.click(confirmBtn);

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith({
        id: EQUIPMENT_ID,
        status: 'dead',
        decommission_reason: 'Device broken',
      });
    });
  });

  it('confirm button is rendered even with empty reason — Zod blocks submission', async () => {
    const onConfirm = vi.fn();
    renderDialog({ onConfirm });

    const confirmBtn = screen.getByRole('button', { name: /Confirmar baja/i });
    await userEvent.click(confirmBtn);

    // Zod validation should block onConfirm from being called
    await waitFor(() => {
      expect(onConfirm).not.toHaveBeenCalled();
    });
    // Error message displayed
    expect(screen.getByText(/motivo de baja es obligatorio/i)).toBeInTheDocument();
  });

  it('cancel button calls onOpenChange(false) without triggering onConfirm', async () => {
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn();
    renderDialog({ onOpenChange, onConfirm });

    const cancelBtn = screen.getByRole('button', { name: /Cancelar/i });
    await userEvent.click(cancelBtn);

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
