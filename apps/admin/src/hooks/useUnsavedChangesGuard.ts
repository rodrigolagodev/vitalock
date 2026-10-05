import { useCallback, useRef, useState } from 'react';

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
 * `requestLeave`; forms render a `ConfirmDialog` with `dialogProps`.
 */
export function useUnsavedChangesGuard({ when }: { when: boolean }): UnsavedChangesGuard {
  const [open, setOpen] = useState(false);
  const whenRef = useRef(when);
  whenRef.current = when;
  const pendingRef = useRef<(() => void) | null>(null);

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
    leave?.();
  }, []);

  const onOpenChange = useCallback((next: boolean) => {
    if (!next) pendingRef.current = null;
    setOpen(next);
  }, []);

  return { requestLeave, dialogProps: { open, onOpenChange, onConfirm } };
}
