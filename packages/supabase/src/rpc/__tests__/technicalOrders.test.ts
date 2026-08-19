import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TypedSupabaseClient } from '../../client';

// Mocked Supabase client.
const mockRpc = vi.fn();
const mockFrom = vi.fn();
const mockClient = { rpc: mockRpc, from: mockFrom } as unknown as TypedSupabaseClient;

import {
  createTechnicalOrderWithItems,
  confirmTechnicalOrder,
  cancelTechnicalOrder,
  updateDraftTechnicalOrderWithItems,
  markTechnicalOrderInvoiced,
  recomputeTechnicalOrderStatus,
} from '../technicalOrders';

const sampleOrder = {
  client_type: 'administration' as const,
  administration_id: 'adm-2',
};
const sampleItems = [
  {
    item_type: 'maintenance' as const,
    quantity: 1,
    building_id: 'b-2',
    unit_price: 200,
    intended_assignee_staff_id: 'staff-1',
    intended_equipment_id: 'eq-1',
  },
];

describe('technicalOrders RPC wrappers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ──────────────────────────────────────────────────────────────
  // createTechnicalOrderWithItems
  // ──────────────────────────────────────────────────────────────
  describe('createTechnicalOrderWithItems', () => {
    it('calls rpc("create_technical_order_with_items") with correct params and returns uuid', async () => {
      const newId = 'technical-order-uuid-1';
      mockRpc.mockResolvedValueOnce({ data: newId, error: null });

      const result = await createTechnicalOrderWithItems(mockClient, {
        order: sampleOrder,
        items: sampleItems,
      });

      expect(mockRpc).toHaveBeenCalledWith('create_technical_order_with_items', {
        p_order: sampleOrder,
        p_items: sampleItems,
        p_confirm_immediately: true,
      });
      expect(result).toBe(newId);
    });

    it('respects confirmImmediately=false', async () => {
      mockRpc.mockResolvedValueOnce({ data: 'draft-id', error: null });

      await createTechnicalOrderWithItems(mockClient, {
        order: sampleOrder,
        items: sampleItems,
        confirmImmediately: false,
      });

      expect(mockRpc).toHaveBeenCalledWith('create_technical_order_with_items', {
        p_order: sampleOrder,
        p_items: sampleItems,
        p_confirm_immediately: false,
      });
    });

    it('throws on RPC error', async () => {
      const err = new Error('TECHNICAL_ORDER_INTENT_REQUIRED');
      mockRpc.mockResolvedValueOnce({ data: null, error: err });

      await expect(
        createTechnicalOrderWithItems(mockClient, { order: sampleOrder, items: sampleItems }),
      ).rejects.toThrow('TECHNICAL_ORDER_INTENT_REQUIRED');
    });
  });

  // ──────────────────────────────────────────────────────────────
  // confirmTechnicalOrder
  // ──────────────────────────────────────────────────────────────
  describe('confirmTechnicalOrder', () => {
    it('calls rpc("confirm_technical_order") with p_order_id', async () => {
      mockRpc.mockResolvedValueOnce({ data: null, error: null });

      await confirmTechnicalOrder(mockClient, 'tech-order-1');

      expect(mockRpc).toHaveBeenCalledWith('confirm_technical_order', {
        p_order_id: 'tech-order-1',
      });
    });

    it('throws on RPC error', async () => {
      const err = new Error('Cannot confirm');
      mockRpc.mockResolvedValueOnce({ data: null, error: err });

      await expect(confirmTechnicalOrder(mockClient, 'tech-order-1')).rejects.toThrow(
        'Cannot confirm',
      );
    });
  });

  // ──────────────────────────────────────────────────────────────
  // cancelTechnicalOrder
  // ──────────────────────────────────────────────────────────────
  describe('cancelTechnicalOrder', () => {
    it('calls rpc("cancel_technical_order") with p_order_id', async () => {
      mockRpc.mockResolvedValueOnce({ data: null, error: null });

      await cancelTechnicalOrder(mockClient, 'tech-order-2');

      expect(mockRpc).toHaveBeenCalledWith('cancel_technical_order', {
        p_order_id: 'tech-order-2',
      });
    });

    it('throws on RPC error', async () => {
      const err = new Error('All tickets resolved');
      mockRpc.mockResolvedValueOnce({ data: null, error: err });

      await expect(cancelTechnicalOrder(mockClient, 'tech-order-2')).rejects.toThrow(
        'All tickets resolved',
      );
    });
  });

  // ──────────────────────────────────────────────────────────────
  // updateDraftTechnicalOrderWithItems
  // ──────────────────────────────────────────────────────────────
  describe('updateDraftTechnicalOrderWithItems', () => {
    it('calls rpc("update_draft_technical_order_with_items") and returns updated_at', async () => {
      const updatedAt = '2026-08-19T12:00:00Z';
      mockRpc.mockResolvedValueOnce({ data: updatedAt, error: null });

      const result = await updateDraftTechnicalOrderWithItems(mockClient, {
        orderId: 'tech-order-3',
        expectedUpdatedAt: '2026-08-18T12:00:00Z',
        patch: { notes: 'patched' },
        items: sampleItems,
      });

      expect(mockRpc).toHaveBeenCalledWith('update_draft_technical_order_with_items', {
        p_order_id: 'tech-order-3',
        p_expected_updated_at: '2026-08-18T12:00:00Z',
        p_patch: { notes: 'patched' },
        p_items: sampleItems,
      });
      expect(result).toBe(updatedAt);
    });

    it('throws on stale token', async () => {
      const err = new Error('TECHNICAL_ORDER_STALE');
      mockRpc.mockResolvedValueOnce({ data: null, error: err });

      await expect(
        updateDraftTechnicalOrderWithItems(mockClient, {
          orderId: 'tech-order-3',
          expectedUpdatedAt: 'old',
          patch: {},
          items: [],
        }),
      ).rejects.toThrow('TECHNICAL_ORDER_STALE');
    });
  });

  // ──────────────────────────────────────────────────────────────
  // markTechnicalOrderInvoiced
  // ──────────────────────────────────────────────────────────────
  describe('markTechnicalOrderInvoiced', () => {
    it('calls rpc("mark_technical_order_invoiced") with p_order_id', async () => {
      mockRpc.mockResolvedValueOnce({ data: null, error: null });

      await markTechnicalOrderInvoiced(mockClient, 'tech-order-4');

      expect(mockRpc).toHaveBeenCalledWith('mark_technical_order_invoiced', {
        p_order_id: 'tech-order-4',
      });
    });

    it('throws on RPC error', async () => {
      const err = new Error('Not completed');
      mockRpc.mockResolvedValueOnce({ data: null, error: err });

      await expect(markTechnicalOrderInvoiced(mockClient, 'tech-order-4')).rejects.toThrow(
        'Not completed',
      );
    });
  });

  // ──────────────────────────────────────────────────────────────
  // recomputeTechnicalOrderStatus
  // ──────────────────────────────────────────────────────────────
  describe('recomputeTechnicalOrderStatus', () => {
    it('calls rpc("recompute_technical_order_status") with p_order_id', async () => {
      mockRpc.mockResolvedValueOnce({ data: null, error: null });

      await recomputeTechnicalOrderStatus(mockClient, 'tech-order-5');

      expect(mockRpc).toHaveBeenCalledWith('recompute_technical_order_status', {
        p_order_id: 'tech-order-5',
      });
    });

    it('throws on RPC error', async () => {
      const err = new Error('Recompute failed');
      mockRpc.mockResolvedValueOnce({ data: null, error: err });

      await expect(recomputeTechnicalOrderStatus(mockClient, 'tech-order-5')).rejects.toThrow(
        'Recompute failed',
      );
    });
  });
});
