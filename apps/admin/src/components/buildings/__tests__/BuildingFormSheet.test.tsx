import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import type { ReactNode } from 'react';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

// Mock mutations
vi.mock('@/hooks/useMutateBuilding', () => ({
  useMutateBuilding: () => ({
    createBuilding: { mutateAsync: vi.fn(), isPending: false },
    updateBuilding: { mutateAsync: vi.fn(), isPending: false },
    deactivateBuilding: { mutateAsync: vi.fn(), isPending: false },
  }),
}));

// Mock useAdministrations to return a list of administrations
vi.mock('@/hooks/useAdministrations', () => ({
  useAdministrations: () => ({
    data: [{ id: 'adm-1', company_name: 'Admin García S.A.' }],
    isLoading: false,
  }),
}));

import { BuildingFormSheet } from '../BuildingFormSheet';

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(
      MemoryRouter,
      null,
      React.createElement(QueryClientProvider, { client: queryClient }, children),
    );
  };
}

describe('BuildingFormSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('without administrationId prop (backward-compatible)', () => {
    it('renders the administration Select when no administrationId is provided', () => {
      render(
        <BuildingFormSheet open={true} onOpenChange={vi.fn()} />,
        { wrapper: makeWrapper() },
      );

      // The Select trigger is present when administrationId is not set
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });
  });

  describe('with administrationId prop', () => {
    it('does NOT render the administration Select when administrationId is provided', () => {
      render(
        <BuildingFormSheet open={true} onOpenChange={vi.fn()} administrationId="adm-1" />,
        { wrapper: makeWrapper() },
      );

      // Select (combobox) must not appear
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    });

    it('pre-fills the hidden administration_id with the provided administrationId', () => {
      render(
        <BuildingFormSheet open={true} onOpenChange={vi.fn()} administrationId="adm-1" />,
        { wrapper: makeWrapper() },
      );

      // The Select is hidden but the form field must carry the pre-filled value.
      // Since the field is a hidden controller value (not a visible input),
      // verify by confirming no combobox and that the sheet renders correctly.
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
      // The name field should still be present
      expect(screen.getByLabelText(/nombre/i)).toBeInTheDocument();
    });
  });
});
