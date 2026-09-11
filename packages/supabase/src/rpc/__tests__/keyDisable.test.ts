import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TypedSupabaseClient } from '../../client';
import { cancelKeyDisable } from '../cancelKeyDisable';
import { requestKeyDisable } from '../requestKeyDisable';

const mockRpc = vi.fn();
const mockClient = { rpc: mockRpc } as unknown as TypedSupabaseClient;

describe('requestKeyDisable', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends only the key id when optional args are absent — SQL defaults apply', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null });
    await requestKeyDisable(mockClient, { keyId: 'k-1' });
    expect(mockRpc).toHaveBeenCalledWith('request_key_disable', { p_key_id: 'k-1' });
  });

  it('omits explicit nulls rather than forwarding them', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null });
    await requestKeyDisable(mockClient, { keyId: 'k-1', actorStaffId: null, note: null });
    const [, args] = mockRpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(args).toEqual({ p_key_id: 'k-1' });
    expect('p_actor_staff_id' in args).toBe(false);
    expect('p_note' in args).toBe(false);
  });

  it('forwards defined optional args', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null });
    await requestKeyDisable(mockClient, { keyId: 'k-1', actorStaffId: 's-1', note: 'lost' });
    expect(mockRpc).toHaveBeenCalledWith('request_key_disable', {
      p_key_id: 'k-1',
      p_actor_staff_id: 's-1',
      p_note: 'lost',
    });
  });

  it('rethrows the Supabase error', async () => {
    const error = { code: 'P0001', message: 'KEY_NOT_ACTIVE' };
    mockRpc.mockResolvedValueOnce({ data: null, error });
    await expect(requestKeyDisable(mockClient, { keyId: 'k-1' })).rejects.toBe(error);
  });
});

describe('cancelKeyDisable', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends only the key id when optional args are absent', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null });
    await cancelKeyDisable(mockClient, { keyId: 'k-2' });
    expect(mockRpc).toHaveBeenCalledWith('cancel_key_disable', { p_key_id: 'k-2' });
  });

  it('forwards defined optional args and omits nulls', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null });
    await cancelKeyDisable(mockClient, { keyId: 'k-2', actorStaffId: 's-2', note: null });
    expect(mockRpc).toHaveBeenCalledWith('cancel_key_disable', {
      p_key_id: 'k-2',
      p_actor_staff_id: 's-2',
    });
  });

  it('rethrows the Supabase error', async () => {
    const error = { code: 'P0001', message: 'NO_PENDING_DISABLE' };
    mockRpc.mockResolvedValueOnce({ data: null, error });
    await expect(cancelKeyDisable(mockClient, { keyId: 'k-2' })).rejects.toBe(error);
  });
});
