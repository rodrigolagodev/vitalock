import { describe, it, expect, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';

import {
  UNSAVED_CHANGES_COPY,
  useUnsavedChangesGuard,
  type UnsavedChangesGuard,
} from '../useUnsavedChangesGuard';

/** The hook uses `useBlocker`, so it must live under a data router. */
function setup(initialWhen: boolean) {
  const holder: { guard: UnsavedChangesGuard; setWhen: (when: boolean) => void } = {
    guard: undefined as unknown as UnsavedChangesGuard,
    setWhen: () => {},
  };
  let when = initialWhen;
  const Probe = () => {
    holder.guard = useUnsavedChangesGuard({ when });
    return null;
  };
  const router = createMemoryRouter(
    [
      { path: '/', element: <Probe /> },
      { path: '/otra', element: <p>otra</p> },
    ],
    { initialEntries: ['/'] },
  );
  const view = render(<RouterProvider router={router} />);
  holder.setWhen = (next) => {
    when = next;
    act(() => {
      void router.navigate('.', { replace: true });
    });
    view.rerender(<RouterProvider router={router} />);
  };
  return { router, holder };
}

describe('useUnsavedChangesGuard', () => {
  it('does not throw on mount under a data router', () => {
    expect(() => setup(false)).not.toThrow();
  });

  it('runs leave at once when the form is clean and opens no dialog', () => {
    const leave = vi.fn();
    const { holder } = setup(false);

    act(() => holder.guard.requestLeave(leave));

    expect(leave).toHaveBeenCalledTimes(1);
    expect(holder.guard.dialogProps.open).toBe(false);
  });

  it('opens the dialog and does not leave when dirty', () => {
    const leave = vi.fn();
    const { holder } = setup(true);

    act(() => holder.guard.requestLeave(leave));

    expect(leave).not.toHaveBeenCalled();
    expect(holder.guard.dialogProps.open).toBe(true);
  });

  it('leaves and closes the dialog on confirm', () => {
    const leave = vi.fn();
    const { holder } = setup(true);

    act(() => holder.guard.requestLeave(leave));
    act(() => holder.guard.dialogProps.onConfirm());

    expect(leave).toHaveBeenCalledTimes(1);
    expect(holder.guard.dialogProps.open).toBe(false);
  });

  it('keeps the user and clears the pending action when the dialog is dismissed', () => {
    const leave = vi.fn();
    const { holder } = setup(true);

    act(() => holder.guard.requestLeave(leave));
    act(() => holder.guard.dialogProps.onOpenChange(false));

    expect(holder.guard.dialogProps.open).toBe(false);
    // A later confirm without a new request must not run the dismissed action.
    act(() => holder.guard.dialogProps.onConfirm());
    expect(leave).not.toHaveBeenCalled();
  });

  it('exposes the Spanish copy', () => {
    expect(UNSAVED_CHANGES_COPY).toEqual({
      title: '¿Descartar los cambios?',
      description: 'Tenés cambios sin guardar. Si salís ahora, se pierden.',
      confirmLabel: 'Descartar cambios',
      cancelLabel: 'Seguir editando',
    });
  });

  describe('navigation blocker', () => {
    it('blocks a dirty navigation to another path and opens the dialog', async () => {
      const { router, holder } = setup(true);

      await act(() => router.navigate('/otra'));

      expect(router.state.location.pathname).toBe('/');
      expect(holder.guard.dialogProps.open).toBe(true);
    });

    it('proceeds to the blocked location on confirm', async () => {
      const { router, holder } = setup(true);
      await act(() => router.navigate('/otra'));

      act(() => holder.guard.dialogProps.onConfirm());

      expect(router.state.location.pathname).toBe('/otra');
    });

    it('stays put and resets the blocker when dismissed, then blocks again', async () => {
      const { router, holder } = setup(true);
      await act(() => router.navigate('/otra'));

      act(() => holder.guard.dialogProps.onOpenChange(false));

      expect(router.state.location.pathname).toBe('/');
      expect(holder.guard.dialogProps.open).toBe(false);
      await act(() => router.navigate('/otra'));
      expect(router.state.location.pathname).toBe('/');
      expect(holder.guard.dialogProps.open).toBe(true);
    });

    it('does not block when the form is clean', async () => {
      const { router, holder } = setup(false);

      await act(() => router.navigate('/otra'));

      expect(router.state.location.pathname).toBe('/otra');
      expect(holder.guard.dialogProps.open).toBe(false);
    });

    it('does not block a search-only change', async () => {
      const { router } = setup(true);

      await act(() => router.navigate('/?filtro=1'));

      expect(router.state.location.search).toBe('?filtro=1');
    });

    it('guards browser back (POP)', async () => {
      const { router, holder } = setup(false);
      await act(() => router.navigate('/otra'));
      expect(router.state.location.pathname).toBe('/otra');
      // The dirty form lives on "/", so go back to it, dirty it, then go forward and back.
      await act(() => router.navigate(-1));
      expect(router.state.location.pathname).toBe('/');
      holder.setWhen(true);

      await act(() => router.navigate(1));

      expect(router.state.location.pathname).toBe('/');
      expect(holder.guard.dialogProps.open).toBe(true);
    });

    it('leaving through Cancel confirm does not raise a second blocker dialog', async () => {
      const { router, holder } = setup(true);
      const leave = vi.fn(() => {
        void router.navigate('/otra');
      });

      act(() => holder.guard.requestLeave(leave));
      await act(async () => holder.guard.dialogProps.onConfirm());

      expect(router.state.location.pathname).toBe('/otra');
    });
  });
});
