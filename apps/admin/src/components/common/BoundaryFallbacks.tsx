import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Outlet, useNavigate, useRouteError } from 'react-router-dom';
import { reportError, type ErrorFallbackProps as BoundaryFallbackProps } from '@vitalock/shared';
import { ErrorFallback, Skeleton } from '@vitalock/ui';

/** Shown while a lazy page chunk loads. */
export function PageFallback() {
  return (
    <div className="flex flex-col gap-4 p-6" aria-busy="true" aria-label="Cargando">
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

/** Root layout route: lazy page chunks suspend below Auth and above every route. */
export function SuspenseOutlet() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Outlet />
    </Suspense>
  );
}

/** Route-level fallback: keeps the shell, offers retry + home. */
export function PageErrorFallback({ reset }: BoundaryFallbackProps) {
  const navigate = useNavigate();
  return <ErrorFallback onRetry={reset} onGoHome={() => navigate('/administraciones')} />;
}

/** Root fallback: nothing below it survived, so only a retry is offered. */
export function RootErrorFallback({ reset }: BoundaryFallbackProps) {
  return (
    <ErrorFallback
      message="La aplicación encontró un error inesperado."
      onRetry={reset}
      className="min-h-screen"
    />
  );
}

/**
 * `errorElement` of the root data route. Data routers catch render errors per
 * route before an outer React boundary sees them, so this reports them (once)
 * and renders the same UI as `RootErrorFallback`, with a reload as reset.
 */
export function RouteErrorFallback() {
  const routeError = useRouteError();
  const error = useMemo(
    () => (routeError instanceof Error ? routeError : new Error(String(routeError))),
    [routeError],
  );
  const reported = useRef<Error | null>(null);
  useEffect(() => {
    if (reported.current === error) return;
    reported.current = error;
    reportError('admin:route', 'Route render error', error);
  }, [error]);
  return <RootErrorFallback error={error} componentStack={null} reset={reloadPage} />;
}

function reloadPage() {
  window.location.reload();
}
