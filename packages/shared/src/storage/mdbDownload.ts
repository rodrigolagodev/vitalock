import { useCallback, useState } from 'react';
import type { TypedSupabaseClient } from '@vitalock/supabase';

/** Bucket holding equipment-update `.mdb` files. RLS: admin rw, installer read. */
export const MDB_BUCKET = 'equipment-updates-mdb';
/** Signed URLs are short-lived on purpose: they are minted per click. */
export const MDB_SIGNED_URL_TTL_SECONDS = 300;

/**
 * Mint a short-lived signed URL for an `.mdb` object. Throws the Supabase
 * error so callers decide how to surface it.
 */
export async function createMdbSignedUrl(
  client: TypedSupabaseClient,
  path: string,
): Promise<string> {
  const { data, error } = await client.storage
    .from(MDB_BUCKET)
    .createSignedUrl(path, MDB_SIGNED_URL_TTL_SECONDS);
  if (error) throw error;
  return data.signedUrl;
}

/** Last path segment, or a fallback name, so the browser saves a sensible file. */
export function mdbFileName(path: string, fallback = 'db.mdb'): string {
  return path.split('/').pop() || fallback;
}

/**
 * Start a browser download without navigating away. An anchor with `download`
 * works in the installer PWA (where `window.open` is often blocked) and keeps
 * the original filename.
 */
export function triggerBrowserDownload(url: string, fileName: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  a.click();
}

export interface UseMdbDownloadOptions {
  /** Called with the Supabase/network error; the hook never throws into React. */
  onError?: (error: unknown) => void;
}

/**
 * Download an `.mdb` by storage path with per-item busy state.
 *
 * Replaces three inline `supabase.storage…createSignedUrl` copies that lived
 * in components across both apps (P1-9): same bucket, same TTL, same anchor
 * trick — now one hook behind the data layer.
 */
export function useMdbDownload(client: TypedSupabaseClient, options: UseMdbDownloadOptions = {}) {
  const { onError } = options;
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const download = useCallback(
    async (path: string, id: string = path): Promise<void> => {
      setDownloadingId(id);
      try {
        const url = await createMdbSignedUrl(client, path);
        triggerBrowserDownload(url, mdbFileName(path));
      } catch (error) {
        onError?.(error);
      } finally {
        setDownloadingId(null);
      }
    },
    [client, onError],
  );

  return { download, downloadingId, isDownloading: downloadingId !== null };
}
