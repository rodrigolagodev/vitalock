import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSingle, mockEq, mockSelect, mockFrom } = vi.hoisted(() => {
  const mockSingle = vi.fn();
  const mockEq = vi.fn(() => ({ single: mockSingle }));
  const mockSelect = vi.fn(() => ({ eq: mockEq }));
  const mockFrom = vi.fn(() => ({ select: mockSelect }));
  return { mockSingle, mockEq, mockSelect, mockFrom };
});

vi.mock('@/lib/supabase', () => ({
  supabase: { from: mockFrom },
}));

import { resolveOrderKind } from '../resolveOrderKind';

beforeEach(() => {
  vi.clearAllMocks();
  mockFrom.mockReturnValue({ select: mockSelect });
  mockSelect.mockReturnValue({ eq: mockEq });
  mockEq.mockReturnValue({ single: mockSingle });
});

describe('resolveOrderKind', () => {
  it("returns 'key' when the VIEW row has order_kind: 'key'", async () => {
    mockSingle.mockResolvedValue({ data: { order_kind: 'key' }, error: null });

    const result = await resolveOrderKind('order-uuid-1');

    expect(result).toBe('key');
    expect(mockFrom).toHaveBeenCalledWith('all_orders');
    expect(mockSelect).toHaveBeenCalledWith('order_kind');
    expect(mockEq).toHaveBeenCalledWith('id', 'order-uuid-1');
  });

  it("returns 'technical' when the VIEW row has order_kind: 'technical'", async () => {
    mockSingle.mockResolvedValue({ data: { order_kind: 'technical' }, error: null });

    const result = await resolveOrderKind('order-uuid-2');

    expect(result).toBe('technical');
  });

  it('throws when the query returns an error', async () => {
    const dbError = new Error('row not found');
    mockSingle.mockResolvedValue({ data: null, error: dbError });

    await expect(resolveOrderKind('bad-uuid')).rejects.toThrow('row not found');
  });
});
