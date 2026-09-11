import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TypedSupabaseClient } from '../../client';
import { createEquipmentUpdate } from '../createEquipmentUpdate';
import { resolveEquipmentUpdate } from '../resolveEquipmentUpdate';

const mockRpc = vi.fn();
const mockClient = { rpc: mockRpc } as unknown as TypedSupabaseClient;

const baseCreate = {
  equipmentId: 'eq-1',
  administrationId: 'adm-1',
  buildingId: 'b-1',
  description: 'Firmware bump',
  mdbStoragePath: 'equipment-updates-mdb/eq-1/v2.mdb',
};

describe('createEquipmentUpdate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reproduces the SQL defaults for the key arrays and omits nullish staff ids', async () => {
    mockRpc.mockResolvedValueOnce({ data: 'ticket-1', error: null });
    const id = await createEquipmentUpdate(mockClient, baseCreate);
    expect(id).toBe('ticket-1');
    expect(mockRpc).toHaveBeenCalledWith('create_equipment_update', {
      p_equipment_id: 'eq-1',
      p_administration_id: 'adm-1',
      p_building_id: 'b-1',
      p_description: 'Firmware bump',
      p_mdb_storage_path: 'equipment-updates-mdb/eq-1/v2.mdb',
      p_keys_to_activate: [],
      p_keys_to_disable: [],
    });
  });

  it('forwards key lists and staff ids when provided', async () => {
    mockRpc.mockResolvedValueOnce({ data: 'ticket-2', error: null });
    await createEquipmentUpdate(mockClient, {
      ...baseCreate,
      keysToActivate: ['k-1'],
      keysToDisable: ['k-2', 'k-3'],
      actorStaffId: 's-1',
      assignedToStaffId: 's-2',
    });
    const [, args] = mockRpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(args.p_keys_to_activate).toEqual(['k-1']);
    expect(args.p_keys_to_disable).toEqual(['k-2', 'k-3']);
    expect(args.p_actor_staff_id).toBe('s-1');
    expect(args.p_assigned_to_staff_id).toBe('s-2');
  });

  it('omits an explicitly null assignee so the ticket lands unassigned', async () => {
    mockRpc.mockResolvedValueOnce({ data: 'ticket-3', error: null });
    await createEquipmentUpdate(mockClient, { ...baseCreate, assignedToStaffId: null });
    const [, args] = mockRpc.mock.calls[0] as [string, Record<string, unknown>];
    expect('p_assigned_to_staff_id' in args).toBe(false);
  });

  it('rethrows the Supabase error', async () => {
    const error = { code: '23503', message: 'fk violation' };
    mockRpc.mockResolvedValueOnce({ data: null, error });
    await expect(createEquipmentUpdate(mockClient, baseCreate)).rejects.toBe(error);
  });
});

describe('resolveEquipmentUpdate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('narrows a well-formed jsonb payload into a typed result', async () => {
    mockRpc.mockResolvedValueOnce({
      data: { ticket_id: 't-1', skipped_key_ids: ['k-9'] },
      error: null,
    });
    const result = await resolveEquipmentUpdate(mockClient, { taskId: 'task-1' });
    expect(mockRpc).toHaveBeenCalledWith('resolve_equipment_update', { p_task_id: 'task-1' });
    expect(result).toEqual({ ticket_id: 't-1', skipped_key_ids: ['k-9'] });
  });

  it('treats a missing skipped_key_ids as an empty list', async () => {
    mockRpc.mockResolvedValueOnce({ data: { ticket_id: 't-2' }, error: null });
    const result = await resolveEquipmentUpdate(mockClient, { taskId: 'task-2' });
    expect(result.skipped_key_ids).toEqual([]);
  });

  it('forwards the actor when given', async () => {
    mockRpc.mockResolvedValueOnce({ data: { ticket_id: 't-3' }, error: null });
    await resolveEquipmentUpdate(mockClient, { taskId: 'task-3', actorStaffId: 's-1' });
    expect(mockRpc).toHaveBeenCalledWith('resolve_equipment_update', {
      p_task_id: 'task-3',
      p_actor_staff_id: 's-1',
    });
  });

  it('throws a TypeError when the RPC returns a non-object payload', async () => {
    mockRpc.mockResolvedValueOnce({ data: 'oops', error: null });
    await expect(resolveEquipmentUpdate(mockClient, { taskId: 'task-4' })).rejects.toThrow(
      /resolve_equipment_update returned a non-object JSON payload/,
    );
  });

  it('throws a TypeError when ticket_id is missing from the payload', async () => {
    mockRpc.mockResolvedValueOnce({ data: { skipped_key_ids: [] }, error: null });
    await expect(resolveEquipmentUpdate(mockClient, { taskId: 'task-5' })).rejects.toThrow(
      /returned no string "ticket_id"/,
    );
  });

  it('rethrows the Supabase error before attempting to narrow', async () => {
    const error = { code: 'P0001', message: 'TICKET_NOT_FOUND' };
    mockRpc.mockResolvedValueOnce({ data: null, error });
    await expect(resolveEquipmentUpdate(mockClient, { taskId: 'task-6' })).rejects.toBe(error);
  });
});
