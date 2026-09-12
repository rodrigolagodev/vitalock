import { useCallback, useEffect, useState } from 'react';

export const DEFAULT_SIDEBAR_STORAGE_KEY = 'vitalock-sidebar-collapsed';

function readStoredCollapsed(storageKey: string): boolean {
  try {
    return window.localStorage.getItem(storageKey) === 'true';
  } catch {
    // localStorage unavailable (SSR, private browsing quota) — default expanded.
    return false;
  }
}

function writeStoredCollapsed(storageKey: string, collapsed: boolean): void {
  try {
    window.localStorage.setItem(storageKey, String(collapsed));
  } catch {
    // Silently ignore persistence failures; in-memory state still works.
  }
}

/**
 * Tracks the sidebar collapsed state with localStorage persistence under
 * `storageKey` (default `vitalock-sidebar-collapsed`) and a global
 * Ctrl+\ / Cmd+\ shortcut. Returns `[collapsed, toggle]`.
 */
export function useSidebarCollapsed(
  storageKey: string = DEFAULT_SIDEBAR_STORAGE_KEY,
): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState<boolean>(() => readStoredCollapsed(storageKey));

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      writeStoredCollapsed(storageKey, next);
      return next;
    });
  }, [storageKey]);

  useEffect(() => {
    // navigator.platform is deprecated; userAgentData is the successor where
    // available, with the UA string as the portable fallback.
    const platform =
      (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
        ?.platform ?? navigator.userAgent;
    const isMac = /Mac/i.test(platform);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== '\\' || e.altKey || e.shiftKey) return;
      const modifier = isMac ? e.metaKey : e.ctrlKey;
      if (!modifier) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggle]);

  return [collapsed, toggle];
}
