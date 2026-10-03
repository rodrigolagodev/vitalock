import { describe, expect, it, vi } from 'vitest';
import { LIST_ROW_CAP, fetchCappedList } from './listCap';

function queryResolving(result: { data: unknown; error: unknown; count?: number | null }) {
  const limit = vi.fn().mockResolvedValue(result);
  return { query: { limit }, limit };
}

describe('fetchCappedList', () => {
  it('caps the query at LIST_ROW_CAP (matching supabase max_rows) by default', async () => {
    const { query, limit } = queryResolving({ data: [], error: null, count: 0 });
    await fetchCappedList(query);
    expect(LIST_ROW_CAP).toBe(1000);
    expect(limit).toHaveBeenCalledWith(LIST_ROW_CAP);
  });

  it('is not truncated when the exact count fits in the returned rows', async () => {
    const { query } = queryResolving({ data: [{ id: 1 }, { id: 2 }], error: null, count: 2 });
    await expect(fetchCappedList(query)).resolves.toEqual({
      rows: [{ id: 1 }, { id: 2 }],
      total: 2,
      truncated: false,
    });
  });

  it('is truncated when the exact count exceeds the returned rows', async () => {
    const { query, limit } = queryResolving({
      data: [{ id: 1 }, { id: 2 }],
      error: null,
      count: 5,
    });
    const result = await fetchCappedList(query, 2);
    expect(limit).toHaveBeenCalledWith(2);
    expect(result).toEqual({ rows: [{ id: 1 }, { id: 2 }], total: 5, truncated: true });
  });

  it('treats a full page as truncated when the count is missing', async () => {
    const { query } = queryResolving({ data: [{ id: 1 }, { id: 2 }], error: null, count: null });
    await expect(fetchCappedList(query, 2)).resolves.toMatchObject({ total: 2, truncated: true });
  });

  it('treats a short page as complete when the count is missing', async () => {
    const { query } = queryResolving({ data: [{ id: 1 }], error: null });
    await expect(fetchCappedList(query, 2)).resolves.toMatchObject({ total: 1, truncated: false });
  });

  it('returns an empty, non-truncated list for null data', async () => {
    const { query } = queryResolving({ data: null, error: null, count: 0 });
    await expect(fetchCappedList(query)).resolves.toEqual({ rows: [], total: 0, truncated: false });
  });

  it('throws the supabase error', async () => {
    const error = new Error('boom');
    const { query } = queryResolving({ data: null, error, count: null });
    await expect(fetchCappedList(query)).rejects.toBe(error);
  });
});
