import { useCallback, useRef, useState } from 'react';
import { useBlocker } from 'react-router-dom';

export interface UnsavedChangesGuard {
  /** Runs `leave` at once when clean; otherwise opens the dialog first. */
  requestLeave: (leave: () => void) => void;
  dialogProps: { open: boolean; onOpenChange: (open: boolean) => void; onConfirm: () => void };
}

export const UNSAVED_CHANGES_COPY = {
  title: '¿Descartar los cambios?',
  description: 'Tenés cambios sin guardar. Si salís ahora, se pierden.',
  confirmLabel: 'Descartar cambios',
  cancelLabel: 'Seguir editando',
} as const;

/**
 * One state machine for "leaving a dirty form": the Cancel button calls
 * `requestLeave`; in-app navigation (sidebar, links, browser back) is caught by
 * a router blocker. Forms render a `ConfirmDialog` with `dialogProps`.
 * Requires a data router (`useBlocker`). Search-only changes never block.
 */
export function useUnsavedChangesGuard({ when }: { when: boolean }): UnsavedChangesGuard {
  const [open, setOpen] = useState(false);
  const whenRef = useRef(when);
  whenRef.current = when;
  const bypassRef = useRef(false);
  const pendingRef = useRef<(() => void) | null>(null);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      whenRef.current && !bypassRef.current && currentLocation.pathname !== nextLocation.pathname,
  );
  const blockerRef = useRef(blocker);
  blockerRef.current = blocker;

  const requestLeave = useCallback((leave: () => void) => {
    if (!whenRef.current) {
      leave();
      return;
    }
    pendingRef.current = leave;
    setOpen(true);
  }, []);

  const onConfirm = useCallback(() => {
    const leave = pendingRef.current;
    pendingRef.current = null;
    setOpen(false);
    // The user already confirmed: the blocker must not fire a second time.
    bypassRef.current = true;
    try {
      if (blockerRef.current.state === 'blocked') blockerRef.current.proceed();
      else leave?.();
    } finally {
      bypassRef.current = false;
    }
  }, []);

  const onOpenChange = useCallback((next: boolean) => {
    if (!next) {
      pendingRef.current = null;
      if (blockerRef.current.state === 'blocked') blockerRef.current.reset();
    }
    setOpen(next);
  }, []);

  return {
    requestLeave,
    dialogProps: { open: open || blocker.state === 'blocked', onOpenChange, onConfirm },
  };
}
