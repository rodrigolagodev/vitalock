/**
 * The only error boundary in the repo. Before this, any render exception
 * white-screened the whole SPA (P1-4).
 *
 * Two usages, same component:
 *   - **root** — wraps the provider tree in each app's `main.tsx`. Catches
 *     crashes in providers, the shell and anything the router renders.
 *   - **route** — `RouteBoundaryLayout` below, mounted as a single pathless
 *     layout route so one crashing page cannot take down the shell.
 *
 * ## Why the fallback is a render prop instead of `ErrorState`
 *
 * `packages/ui` is NOT a dependency of `@vitalock/shared` (see
 * `packages/shared/package.json`) and adding one is out of scope here.
 * The boundary therefore owns *behavior* only and takes the presentation as a
 * render prop; both apps pass `ErrorState` from `@vitalock/ui`. The built-in
 * `defaultFallback` is a deliberately plain last resort for boundaries mounted
 * above the design system (or in tests) — not a second `ErrorState`.
 *
 * ## Why `resetKeys` is hand-rolled
 *
 * `react-error-boundary` is not installed anywhere in this workspace
 * (verified against the lockfile) and dependency changes are out of scope,
 * so the reset-on-key-change behavior is implemented here in ~10 lines.
 */

import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { logger } from '../logger/logger';
import { redactError } from './redactError';

export interface ErrorFallbackProps {
  error: Error;
  /** React's component stack for the throwing subtree, when available. */
  componentStack: string | null;
  /** Clears the boundary and re-renders `children`. */
  reset: () => void;
}

export interface AppErrorBoundaryProps {
  children?: ReactNode;
  /** Presentational fallback. Apps pass `ErrorState` from `@vitalock/ui`. */
  fallback?: (props: ErrorFallbackProps) => ReactNode;
  /** Called after the boundary clears its error, before children re-render. */
  onReset?: () => void;
  /** Extra reporting hook, invoked after the logger call. */
  onError?: (error: Error, componentStack: string | null) => void;
  /**
   * When any value here changes while the boundary is showing its fallback,
   * the error is cleared automatically. Route-level boundaries pass the
   * current pathname so navigating away recovers without a reload.
   */
  resetKeys?: readonly unknown[];
  /** Logger tag. Defaults to `error-boundary`. */
  tag?: string;
}

interface AppErrorBoundaryState {
  error: Error | null;
  componentStack: string | null;
}

function keysChanged(a: readonly unknown[] = [], b: readonly unknown[] = []): boolean {
  if (a.length !== b.length) return true;
  return a.some((value, index) => !Object.is(value, b[index]));
}

/**
 * Last-resort fallback. Neutral Spanish to match the apps' UI copy.
 * Intentionally minimal — the real surface is `ErrorState` from `@vitalock/ui`.
 */
function defaultFallback({ reset }: ErrorFallbackProps): ReactNode {
  return (
    <div role="alert" className="flex flex-col items-center justify-center py-12 text-center">
      <p className="text-destructive text-sm">Ocurrió un error inesperado. Intentá de nuevo.</p>
      <button type="button" onClick={reset} className="mt-4 text-sm underline">
        Reintentar
      </button>
    </div>
  );
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  override state: AppErrorBoundaryState = { error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): Partial<AppErrorBoundaryState> {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    const componentStack = info.componentStack ?? null;
    this.setState({ componentStack });

    // Central report. Every registered sink sees it — console in dev, the
    // reporting sink in production (see `logger/sinks/reportingSink.ts`).
    logger(this.props.tag ?? 'error-boundary').error('render error', {
      error: redactError(error),
      componentStack,
    });

    this.props.onError?.(error, componentStack);
  }

  override componentDidUpdate(prevProps: AppErrorBoundaryProps): void {
    if (this.state.error === null) return;
    if (keysChanged(prevProps.resetKeys, this.props.resetKeys)) {
      this.reset();
    }
  }

  reset = (): void => {
    this.setState({ error: null, componentStack: null });
    this.props.onReset?.();
  };

  override render(): ReactNode {
    const { error, componentStack } = this.state;
    if (error === null) return this.props.children ?? null;

    const render = this.props.fallback ?? defaultFallback;
    return render({ error, componentStack, reset: this.reset });
  }
}

export type RouteBoundaryLayoutProps = Omit<AppErrorBoundaryProps, 'children' | 'resetKeys'>;

/**
 * Route-level boundary as a single pathless layout route:
 *
 * ```tsx
 * <Route element={<App />}>
 *   <Route element={<RouteBoundaryLayout fallback={pageFallback} />}>
 *     ...every page route...
 *   </Route>
 * </Route>
 * ```
 *
 * One wrapper covers every page instead of hand-wrapping 20 route elements,
 * and it sits *below* the shell so a crashing page keeps the sidebar/topbar
 * usable. `resetKeys` is the pathname, so navigating (including between two
 * ids on the same `<Route>`, which does not remount) clears the error.
 */
export function RouteBoundaryLayout(props: RouteBoundaryLayoutProps) {
  const location = useLocation();
  return (
    <AppErrorBoundary {...props} resetKeys={[location.pathname]}>
      <Outlet />
    </AppErrorBoundary>
  );
}
