import { useNavigate } from 'react-router-dom';
import type { ErrorFallbackProps as BoundaryFallbackProps } from '@vitalock/shared';
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
