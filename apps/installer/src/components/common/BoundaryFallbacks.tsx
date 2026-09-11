import { useNavigate } from 'react-router-dom';
import type { ErrorFallbackProps as BoundaryFallbackProps } from '@vitalock/shared';
import { ErrorFallback, Skeleton } from '@vitalock/ui';

/** Shown while a lazy page chunk loads. */
export function PageFallback() {
  return (
    <div className="flex flex-col gap-3 p-4" aria-busy="true" aria-label="Cargando">
      <Skeleton className="h-6 w-1/2" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-20 w-full" />
    </div>
  );
}

/** Route-level fallback: keeps the shell, offers retry + home. */
export function PageErrorFallback({ reset }: BoundaryFallbackProps) {
  const navigate = useNavigate();
  return <ErrorFallback onRetry={reset} onGoHome={() => navigate('/')} />;
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
