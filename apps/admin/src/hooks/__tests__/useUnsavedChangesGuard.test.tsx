import { describe, it, expect, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { UNSAVED_CHANGES_COPY, useUnsavedChangesGuard } from '../useUnsavedChangesGuard';

describe('useUnsavedChangesGuard', () => {
  it('runs leave at once when the form is clean and opens no dialog', () => {
    const leave = vi.fn();
    const { result } = renderHook(() => useUnsavedChangesGuard({ when: false }));

    act(() => result.current.requestLeave(leave));

    expect(leave).toHaveBeenCalledTimes(1);
    expect(result.current.dialogProps.open).toBe(false);
  });

  it('opens the dialog and does not leave when dirty', () => {
    const leave = vi.fn();
    const { result } = renderHook(() => useUnsavedChangesGuard({ when: true }));

    act(() => result.current.requestLeave(leave));

    expect(leave).not.toHaveBeenCalled();
    expect(result.current.dialogProps.open).toBe(true);
  });

  it('leaves and closes the dialog on confirm', () => {
    const leave = vi.fn();
    const { result } = renderHook(() => useUnsavedChangesGuard({ when: true }));

    act(() => result.current.requestLeave(leave));
    act(() => result.current.dialogProps.onConfirm());

    expect(leave).toHaveBeenCalledTimes(1);
    expect(result.current.dialogProps.open).toBe(false);
  });

  it('keeps the user and clears the pending action when the dialog is dismissed', () => {
    const leave = vi.fn();
    const { result } = renderHook(() => useUnsavedChangesGuard({ when: true }));

    act(() => result.current.requestLeave(leave));
    act(() => result.current.dialogProps.onOpenChange(false));

    expect(result.current.dialogProps.open).toBe(false);
    // A later confirm without a new request must not run the dismissed action.
    act(() => result.current.dialogProps.onConfirm());
    expect(leave).not.toHaveBeenCalled();
  });

  it('reads the latest `when` value (no stale closure)', () => {
    const leave = vi.fn();
    const { result, rerender } = renderHook(({ when }) => useUnsavedChangesGuard({ when }), {
      initialProps: { when: true },
    });
    rerender({ when: false });

    act(() => result.current.requestLeave(leave));

    expect(leave).toHaveBeenCalledTimes(1);
    expect(result.current.dialogProps.open).toBe(false);
  });

  it('exposes the Spanish copy', () => {
    expect(UNSAVED_CHANGES_COPY).toEqual({
      title: '¿Descartar los cambios?',
      description: 'Tenés cambios sin guardar. Si salís ahora, se pierden.',
      confirmLabel: 'Descartar cambios',
      cancelLabel: 'Seguir editando',
    });
  });
});
