import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'vitalock-sidebar-collapsed';

function readStoredCollapsed(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    // localStorage unavailable (SSR, private browsing quota) — default expanded.
    return false;
  }
}

function writeStoredCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(collapsed));
  } catch {
    // Silently ignore persistence failures; in-memory state still works.
  }
}

/**
 * Tracks the admin sidebar collapsed state with localStorage persistence
 * (key `vitalock-sidebar-collapsed`) and a global Ctrl+\ / Cmd+\ shortcut.
 * Returns `[collapsed, toggle]`.
 */
export function useSidebarCollapsed(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState<boolean>(readStoredCollapsed);

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      writeStoredCollapsed(next);
      return next;
    });
  }, []);

  useEffect(() => {
    const isMac = /Mac/i.test(window.navigator.platform);
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
