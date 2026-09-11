import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TypedSupabaseClient } from '@vitalock/supabase';
import { createMdbSignedUrl, mdbFileName, useMdbDownload } from '../mdbDownload';

function clientWith(result: { data: { signedUrl: string } | null; error: unknown }) {
  const createSignedUrl = vi.fn().mockResolvedValue(result);
  const client = {
    storage: { from: vi.fn(() => ({ createSignedUrl })) },
  } as unknown as TypedSupabaseClient;
  return {
    client,
    createSignedUrl,
    from: client.storage.from as unknown as ReturnType<typeof vi.fn>,
  };
}

afterEach(() => vi.restoreAllMocks());

describe('mdbFileName', () => {
  it('returns the last path segment', () => {
    expect(mdbFileName('equipment-updates-mdb/eq-1/v3.mdb')).toBe('v3.mdb');
  });
  it('falls back when the path has no segment', () => {
    expect(mdbFileName('')).toBe('db.mdb');
  });
});

describe('createMdbSignedUrl', () => {
  it('mints a 300s signed URL from the mdb bucket', async () => {
    const { client, createSignedUrl, from } = clientWith({
      data: { signedUrl: 'https://x/signed' },
      error: null,
    });
    await expect(createMdbSignedUrl(client, 'eq-1/v3.mdb')).resolves.toBe('https://x/signed');
    expect(from).toHaveBeenCalledWith('equipment-updates-mdb');
    expect(createSignedUrl).toHaveBeenCalledWith('eq-1/v3.mdb', 300);
  });
  it('throws the storage error', async () => {
    const error = { message: 'Object not found' };
    const { client } = clientWith({ data: null, error });
    await expect(createMdbSignedUrl(client, 'missing.mdb')).rejects.toBe(error);
  });
});

describe('useMdbDownload', () => {
  it('signs, triggers an anchor download with the file name, and clears busy state', async () => {
    const { client } = clientWith({ data: { signedUrl: 'https://x/signed' }, error: null });
    const anchor = { click: vi.fn() } as unknown as HTMLAnchorElement;
    // Testing Library creates its container with createElement('div'), so only
    // intercept the anchor.
    const original = document.createElement.bind(document);
    const create = vi
      .spyOn(document, 'createElement')
      .mockImplementation((tag: string) => (tag === 'a' ? anchor : original(tag)));
    const { result } = renderHook(() => useMdbDownload(client));

    await act(() => result.current.download('eq-1/v3.mdb', 'row-1'));

    expect(create).toHaveBeenCalledWith('a');
    expect(anchor.href).toBe('https://x/signed');
    expect(anchor.download).toBe('v3.mdb');
    expect(anchor.click).toHaveBeenCalledTimes(1);
    expect(result.current.downloadingId).toBeNull();
    expect(result.current.isDownloading).toBe(false);
  });

  it('reports the error through onError and never throws', async () => {
    const error = { message: 'boom' };
    const { client } = clientWith({ data: null, error });
    const onError = vi.fn();
    const { result } = renderHook(() => useMdbDownload(client, { onError }));

    await act(() => result.current.download('eq-1/v3.mdb'));

    expect(onError).toHaveBeenCalledWith(error);
    expect(result.current.downloadingId).toBeNull();
  });
});
