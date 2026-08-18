import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  mockCreateSignedUrl,
  mockFrom,
  mockStorageFrom,
  mockSelect,
  mockIn,
  mockRfidKeysQuery,
  mockResolveEquipmentUpdateRpc,
  mockToastSuccess,
  mockToastWarning,
} = vi.hoisted(() => {
  const mockIn = vi.fn();
  const mockSelect = vi.fn(() => ({ in: mockIn }));
  const mockRfidKeysFrom = vi.fn(() => ({ select: mockSelect }));
  const mockCreateSignedUrl = vi.fn();
  const mockStorageFrom = vi.fn(() => ({ createSignedUrl: mockCreateSignedUrl }));

  return {
    mockCreateSignedUrl,
    mockFrom: mockRfidKeysFrom,
    mockStorageFrom,
    mockSelect,
    mockIn,
    mockRfidKeysQuery: mockIn,
    mockResolveEquipmentUpdateRpc: vi.fn(),
    mockToastSuccess: vi.fn(),
    mockToastWarning: vi.fn(),
  };
});

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: mockFrom,
    storage: { from: mockStorageFrom },
  },
}));

vi.mock('@vitalock/supabase', () => ({
  resolveEquipmentUpdate: mockResolveEquipmentUpdateRpc,
}));

vi.mock('sonner', () => ({
  toast: { success: mockToastSuccess, warning: mockToastWarning, error: vi.fn() },
}));

vi.mock('@vitalock/shared', () => ({
  useAuthContext: () => ({
    staff: { id: 'installer-001', full_name: 'Pablo', role: 'installer', status: 'active' },
  }),
  logger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

// ---------------------------------------------------------------------------
// Import under test (after mocks)
// ---------------------------------------------------------------------------

import { EquipmentUpdateResolveDetail } from '../EquipmentUpdateResolveDetail';
import type { AssignedTicket } from '@/hooks/useAssignedTickets';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

function makeTicket(overrides: Partial<AssignedTicket> = {}): AssignedTicket {
  return {
    id: 'ticket-001',
    title: 'Actualización SN-001',
    description: 'Actualización SN-001',
    status: 'open',
    category: 'equipment_update',
    opened_at: '2026-08-17T00:00:00Z',
    building: {
      id: 'bld-001',
      name: 'Edificio Test',
      administration: { id: 'adm-001', company_name: 'Admin Test' },
    },
    equipmentUpdateSnapshot: {
      task_id: 'task-001',
      mdb_storage_path: 'task-001/equip.mdb',
      keys_to_activate: ['key-uuid-activate-001'],
      keys_to_disable: ['key-uuid-disable-001'],
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EquipmentUpdateResolveDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: rfid_keys lookup returns codes for both keys
    mockIn.mockResolvedValue({
      data: [
        { id: 'key-uuid-activate-001', rfid_code: 'RFID-ACT-001' },
        { id: 'key-uuid-disable-001', rfid_code: 'RFID-DIS-001' },
      ],
      error: null,
    });
  });

  describe('Download .mdb flow', () => {
    it('calls createSignedUrl with the correct path and TTL of 300', async () => {
      const user = userEvent.setup();
      const signedUrl = 'https://storage.example.com/signed/equip.mdb?token=abc';
      mockCreateSignedUrl.mockResolvedValueOnce({ data: { signedUrl }, error: null });

      const Wrapper = makeWrapper();
      render(
        React.createElement(Wrapper, null,
          React.createElement(EquipmentUpdateResolveDetail, {
            open: true,
            onOpenChange: vi.fn(),
            ticket: makeTicket(),
          }),
        ),
      );

      const downloadBtn = screen.getByRole('button', { name: /descargar/i });
      await user.click(downloadBtn);

      expect(mockStorageFrom).toHaveBeenCalledWith('equipment-updates-mdb');
      expect(mockCreateSignedUrl).toHaveBeenCalledWith('task-001/equip.mdb', 300);
    });

    it('creates an anchor element with the signed URL as href', async () => {
      const user = userEvent.setup();
      const signedUrl = 'https://storage.example.com/signed/equip.mdb?token=abc';
      mockCreateSignedUrl.mockResolvedValueOnce({ data: { signedUrl }, error: null });

      // Spy on document.createElement to intercept the anchor creation
      const originalCreateElement = document.createElement.bind(document);
      const anchors: HTMLAnchorElement[] = [];
      const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        const el = originalCreateElement(tag);
        if (tag === 'a') {
          const clickSpy = vi.spyOn(el as HTMLAnchorElement, 'click').mockImplementation(() => {});
          anchors.push(el as HTMLAnchorElement);
        }
        return el;
      });

      const Wrapper = makeWrapper();
      render(
        React.createElement(Wrapper, null,
          React.createElement(EquipmentUpdateResolveDetail, {
            open: true,
            onOpenChange: vi.fn(),
            ticket: makeTicket(),
          }),
        ),
      );

      const downloadBtn = screen.getByRole('button', { name: /descargar/i });
      await user.click(downloadBtn);

      await waitFor(() => expect(mockCreateSignedUrl).toHaveBeenCalled());

      // Verify the anchor href was set to the signed URL
      expect(anchors.length).toBeGreaterThan(0);
      const anchor = anchors[0]!;
      expect(anchor.href).toBe(signedUrl);

      createElementSpy.mockRestore();
    });

    it('does nothing when createSignedUrl returns an error', async () => {
      const user = userEvent.setup();
      mockCreateSignedUrl.mockResolvedValueOnce({ data: null, error: new Error('storage error') });

      const createElementSpy = vi.spyOn(document, 'createElement');

      const Wrapper = makeWrapper();
      render(
        React.createElement(Wrapper, null,
          React.createElement(EquipmentUpdateResolveDetail, {
            open: true,
            onOpenChange: vi.fn(),
            ticket: makeTicket(),
          }),
        ),
      );

      const downloadBtn = screen.getByRole('button', { name: /descargar/i });
      await user.click(downloadBtn);

      await waitFor(() => expect(mockCreateSignedUrl).toHaveBeenCalled());

      // No anchor.click() should have been attempted — createElement for 'a' only called by the component if URL is valid
      const anchorCalls = createElementSpy.mock.calls.filter(([tag]) => tag === 'a');
      expect(anchorCalls.length).toBe(0);

      createElementSpy.mockRestore();
    });
  });

  describe('rfid_code display', () => {
    it('renders rfid_code instead of UUID slice when codes are loaded', async () => {
      const Wrapper = makeWrapper();
      render(
        React.createElement(Wrapper, null,
          React.createElement(EquipmentUpdateResolveDetail, {
            open: true,
            onOpenChange: vi.fn(),
            ticket: makeTicket(),
          }),
        ),
      );

      await waitFor(() => {
        expect(screen.getByText('RFID-ACT-001')).toBeInTheDocument();
        expect(screen.getByText('RFID-DIS-001')).toBeInTheDocument();
      });
    });

    it('falls back to UUID slice when rfid_code lookup returns nothing for a key', async () => {
      // Return only one code; leave the disable key unmapped
      mockIn.mockResolvedValueOnce({
        data: [{ id: 'key-uuid-activate-001', rfid_code: 'RFID-ACT-001' }],
        error: null,
      });

      const Wrapper = makeWrapper();
      render(
        React.createElement(Wrapper, null,
          React.createElement(EquipmentUpdateResolveDetail, {
            open: true,
            onOpenChange: vi.fn(),
            ticket: makeTicket(),
          }),
        ),
      );

      await waitFor(() => {
        expect(screen.getByText('RFID-ACT-001')).toBeInTheDocument();
        // Falls back to slice for the unmapped key
        expect(screen.getByText('key-uuid…')).toBeInTheDocument();
      });
    });
  });
});
