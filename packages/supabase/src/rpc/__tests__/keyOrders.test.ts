import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TypedSupabaseClient } from '../../client';

// Mocked Supabase client — covers both .rpc() and .from() call paths.
const mockRpc = vi.fn();
const mockEq = vi.fn();
const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
const mockFrom = vi.fn().mockReturnValue({ update: mockUpdate });
const mockClient = { rpc: mockRpc, from: mockFrom } as unknown as TypedSupabaseClient;

import {
  createKeyOrderWithItems,
  confirmKeyOrder,
  cancelKeyOrder,
  updateDraftKeyOrderWithItems,
  markKeyOrderInvoiced,
  configureKeyOrderItem,
  setKeyOrderPickupPerson,
} from '../keyOrders';

const sampleOrder = {
  client_type: 'administration' as const,
  administration_id: 'adm-1',
};
const sampleItems = [
  { item_type: 'key' as const, quantity: 1, building_id: 'b-1', unit_price: 100 },
];

describe('keyOrders RPC wrappers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEq.mockResolvedValue({ data: null, error: null });
    mockUpdate.mockReturnValue({ eq: mockEq });
    mockFrom.mockReturnValue({ update: mockUpdate });
  });

  // ──────────────────────────────────────────────────────────────
  // createKeyOrderWithItems
  // ──────────────────────────────────────────────────────────────
  describe('createKeyOrderWithItems', () => {
    it('calls rpc("create_key_order_with_items") with correct params and returns uuid', async () => {
      const newId = 'key-order-uuid-1';
      mockRpc.mockResolvedValueOnce({ data: newId, error: null });

      const result = await createKeyOrderWithItems(mockClient, {
        order: sampleOrder,
        items: sampleItems,
      });

      expect(mockRpc).toHaveBeenCalledWith('create_key_order_with_items', {
        p_order: sampleOrder,
        p_items: sampleItems,
        p_confirm_immediately: true,
      });
      expect(result).toBe(newId);
    });

    it('respects confirmImmediately=false', async () => {
      mockRpc.mockResolvedValueOnce({ data: 'draft-id', error: null });

      await createKeyOrderWithItems(mockClient, {
        order: sampleOrder,
        items: sampleItems,
        confirmImmediately: false,
      });

      expect(mockRpc).toHaveBeenCalledWith('create_key_order_with_items', {
        p_order: sampleOrder,
        p_items: sampleItems,
        p_confirm_immediately: false,
      });
    });

    it('throws on RPC error', async () => {
      const err = new Error('DB error');
      mockRpc.mockResolvedValueOnce({ data: null, error: err });

      await expect(
        createKeyOrderWithItems(mockClient, { order: sampleOrder, items: sampleItems }),
      ).rejects.toThrow('DB error');
    });
  });

  // ──────────────────────────────────────────────────────────────
  // confirmKeyOrder
  // ──────────────────────────────────────────────────────────────
  describe('confirmKeyOrder', () => {
    it('calls rpc("confirm_key_order") with p_order_id', async () => {
      mockRpc.mockResolvedValueOnce({ data: null, error: null });

      await confirmKeyOrder(mockClient, 'order-1');

      expect(mockRpc).toHaveBeenCalledWith('confirm_key_order', {
        p_order_id: 'order-1',
      });
    });

    it('throws on RPC error', async () => {
      const err = new Error('Cannot confirm');
      mockRpc.mockResolvedValueOnce({ data: null, error: err });

      await expect(confirmKeyOrder(mockClient, 'order-1')).rejects.toThrow('Cannot confirm');
    });
  });

  // ──────────────────────────────────────────────────────────────
  // cancelKeyOrder
  // ──────────────────────────────────────────────────────────────
  describe('cancelKeyOrder', () => {
    it('calls rpc("cancel_key_order") with p_order_id', async () => {
      mockRpc.mockResolvedValueOnce({ data: null, error: null });

      await cancelKeyOrder(mockClient, 'order-2');

      expect(mockRpc).toHaveBeenCalledWith('cancel_key_order', {
        p_order_id: 'order-2',
      });
    });

    it('throws on RPC error', async () => {
      const err = new Error('Terminal state');
      mockRpc.mockResolvedValueOnce({ data: null, error: err });

      await expect(cancelKeyOrder(mockClient, 'order-2')).rejects.toThrow('Terminal state');
    });
  });

  // ──────────────────────────────────────────────────────────────
  // updateDraftKeyOrderWithItems
  // ──────────────────────────────────────────────────────────────
  describe('updateDraftKeyOrderWithItems', () => {
    it('calls rpc("update_draft_key_order_with_items") with all params and returns updated_at', async () => {
      const updatedAt = '2026-08-19T00:00:00Z';
      mockRpc.mockResolvedValueOnce({ data: updatedAt, error: null });

      const result = await updateDraftKeyOrderWithItems(mockClient, {
        orderId: 'order-3',
        expectedUpdatedAt: '2026-08-18T00:00:00Z',
        patch: { notes: 'updated' },
        items: sampleItems,
      });

      expect(mockRpc).toHaveBeenCalledWith('update_draft_key_order_with_items', {
        p_order_id: 'order-3',
        p_expected_updated_at: '2026-08-18T00:00:00Z',
        p_patch: { notes: 'updated' },
        p_items: sampleItems,
      });
      expect(result).toBe(updatedAt);
    });

    it('throws on stale concurrency token', async () => {
      const err = new Error('KEY_ORDER_STALE');
      mockRpc.mockResolvedValueOnce({ data: null, error: err });

      await expect(
        updateDraftKeyOrderWithItems(mockClient, {
          orderId: 'order-3',
          expectedUpdatedAt: 'old-ts',
          patch: {},
          items: [],
        }),
      ).rejects.toThrow('KEY_ORDER_STALE');
    });
  });

  // ──────────────────────────────────────────────────────────────
  // markKeyOrderInvoiced
  // ──────────────────────────────────────────────────────────────
  describe('markKeyOrderInvoiced', () => {
    it('calls rpc("mark_key_order_invoiced") with p_order_id', async () => {
      mockRpc.mockResolvedValueOnce({ data: null, error: null });

      await markKeyOrderInvoiced(mockClient, 'order-4');

      expect(mockRpc).toHaveBeenCalledWith('mark_key_order_invoiced', {
        p_order_id: 'order-4',
      });
    });

    it('throws on RPC error', async () => {
      const err = new Error('Not completed');
      mockRpc.mockResolvedValueOnce({ data: null, error: err });

      await expect(markKeyOrderInvoiced(mockClient, 'order-4')).rejects.toThrow('Not completed');
    });
  });

  // ──────────────────────────────────────────────────────────────
  // configureKeyOrderItem
  // ──────────────────────────────────────────────────────────────
  // ──────────────────────────────────────────────────────────────
  // setKeyOrderPickupPerson (direct-table helper)
  // ──────────────────────────────────────────────────────────────
  describe('setKeyOrderPickupPerson', () => {
    it('updates key_orders.pickup_particular_id for the given order id', async () => {
      mockEq.mockResolvedValueOnce({ data: null, error: null });

      await setKeyOrderPickupPerson(mockClient, {
        orderId: 'order-5',
        pickupParticularId: 'particular-9',
      });

      expect(mockFrom).toHaveBeenCalledWith('key_orders');
      expect(mockUpdate).toHaveBeenCalledWith({ pickup_particular_id: 'particular-9' });
      expect(mockEq).toHaveBeenCalledWith('id', 'order-5');
    });

    it('accepts null to clear the pickup particular', async () => {
      mockEq.mockResolvedValueOnce({ data: null, error: null });

      await setKeyOrderPickupPerson(mockClient, {
        orderId: 'order-5',
        pickupParticularId: null,
      });

      expect(mockUpdate).toHaveBeenCalledWith({ pickup_particular_id: null });
    });

    it('throws on update error', async () => {
      const err = new Error('Not allowed');
      mockEq.mockResolvedValueOnce({ data: null, error: err });

      await expect(
        setKeyOrderPickupPerson(mockClient, { orderId: 'order-5', pickupParticularId: 'p-1' }),
      ).rejects.toThrow('Not allowed');
    });
  });

  describe('configureKeyOrderItem', () => {
    it('calls rpc("configure_key_order_item") with all required params and returns uuid', async () => {
      const newKeyId = 'rfid-key-uuid';
      mockRpc.mockResolvedValueOnce({ data: newKeyId, error: null });

      const result = await configureKeyOrderItem(mockClient, {
        orderItemId: 'item-1',
        rfidCode: 'RFID-CODE',
        unitId: 'unit-1',
        equipmentIds: ['eq-1'],
      });

      expect(mockRpc).toHaveBeenCalledWith('configure_key_order_item', {
        p_order_item_id: 'item-1',
        p_rfid_code: 'RFID-CODE',
        p_unit_id: 'unit-1',
        p_equipment_ids: ['eq-1'],
      });
      expect(result).toBe(newKeyId);
    });

    it('throws on RPC error', async () => {
      const err = new Error('Invalid RFID');
      mockRpc.mockResolvedValueOnce({ data: null, error: err });

      await expect(
        configureKeyOrderItem(mockClient, {
          orderItemId: 'item-1',
          rfidCode: 'BAD',
          unitId: 'unit-1',
          equipmentIds: [],
        }),
      ).rejects.toThrow('Invalid RFID');
    });
  });
});
