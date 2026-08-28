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
  mockSupportSchema,
  mockPriorUpdatesSelect,
  mockPriorUpdatesEq,
  mockPriorUpdatesNot,
  mockPriorUpdatesOrder,
} = vi.hoisted(() => {
  const mockIn = vi.fn();
  const mockSelect = vi.fn(() => ({ in: mockIn }));
  const mockRfidKeysFrom = vi.fn(() => ({ select: mockSelect }));
  const mockCreateSignedUrl = vi.fn();
  const mockStorageFrom = vi.fn(() => ({ createSignedUrl: mockCreateSignedUrl }));

  // Support-schema chain: supabase.schema('support').from('equipment_updates').select(...).eq(...).not(...).order(...)
  const mockPriorUpdatesOrder = vi.fn();
  const mockPriorUpdatesNot = vi.fn(() => ({ order: mockPriorUpdatesOrder }));
  const mockPriorUpdatesEq = vi.fn(() => ({ not: mockPriorUpdatesNot }));
  const mockPriorUpdatesSelect = vi.fn(() => ({ eq: mockPriorUpdatesEq }));
  const mockSupportFrom = vi.fn(() => ({ select: mockPriorUpdatesSelect }));
  const mockSupportSchema = vi.fn(() => ({ from: mockSupportFrom }));

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
    mockSupportSchema,
    mockPriorUpdatesSelect,
    mockPriorUpdatesEq,
    mockPriorUpdatesNot,
    mockPriorUpdatesOrder,
  };
});

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: mockFrom,
    storage: { from: mockStorageFrom },
    schema: mockSupportSchema,
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
      equipment_id: 'equip-001',
      mdb_storage_path: 'task-001/equip.mdb',
      keys_to_activate: ['key-uuid-activate-001'],
      keys_to_disable: ['key-uuid-disable-001'],
    },
    pending_new_serial: null,
    pending_new_model: null,
    intended_product_name: null,
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
    // Default: prior updates returns empty list
    mockPriorUpdatesOrder.mockResolvedValue({ data: [], error: null });
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

  describe('Prior updates collapsible (rollback section)', () => {
    it('renders <details> collapsible "Actualizaciones anteriores" when equipment_id is present and prior updates exist', async () => {
      mockPriorUpdatesOrder.mockResolvedValueOnce({
        data: [
          {
            id: 'upd-001',
            created_at: '2026-08-10T12:00:00Z',
            mdb_storage_path: 'task-000/equip.mdb',
          },
        ],
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
        expect(screen.getByText('Actualizaciones anteriores')).toBeInTheDocument();
      });

      // The collapsible must be a <details> element
      const details = document.querySelector('details');
      expect(details).toBeInTheDocument();
    });

    it('renders warning banner when prior updates section is present', async () => {
      mockPriorUpdatesOrder.mockResolvedValueOnce({
        data: [
          {
            id: 'upd-001',
            created_at: '2026-08-10T12:00:00Z',
            mdb_storage_path: 'task-000/equip.mdb',
          },
        ],
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
        expect(
          screen.getByText(/desincronizará la base de datos/i),
        ).toBeInTheDocument();
      });
    });

    it('renders a download button for each prior update row', async () => {
      mockPriorUpdatesOrder.mockResolvedValueOnce({
        data: [
          {
            id: 'upd-001',
            created_at: '2026-08-10T12:00:00Z',
            mdb_storage_path: 'task-000/equip.mdb',
          },
          {
            id: 'upd-002',
            created_at: '2026-08-05T09:00:00Z',
            mdb_storage_path: 'task-prev/equip.mdb',
          },
        ],
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
        // One download button per prior update row
        const downloadBtns = screen.getAllByRole('button', { name: /descargar/i });
        // The main MDB download button + 2 prior update buttons = 3
        expect(downloadBtns.length).toBeGreaterThanOrEqual(3);
      });
    });
  });
});
