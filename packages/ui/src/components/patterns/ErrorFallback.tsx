import { Button } from '../button';
import { ErrorState } from './ErrorState';

export interface ErrorFallbackProps {
  /** Headline shown to the user. Defaults to a generic message. */
  message?: string;
  /** Clears the boundary and re-renders the failed subtree. */
  onRetry: () => void;
  /** Optional secondary action, e.g. navigate home. */
  onGoHome?: () => void;
  className?: string;
}

/**
 * Presentation for an `AppErrorBoundary` fallback. The boundary itself lives
 * in `@vitalock/shared` and owns behavior (logging, reset keys); this is the
 * design-system face both apps hand it as a render prop.
 */
export function ErrorFallback({
  message = 'Algo salió mal al mostrar esta pantalla.',
  onRetry,
  onGoHome,
  className,
}: ErrorFallbackProps) {
  return (
    <ErrorState message={message} className={className}>
      <div className="mt-4 flex gap-2">
        <Button type="button" variant="outline" onClick={onRetry}>
          Reintentar
        </Button>
        {onGoHome ? (
          <Button type="button" variant="ghost" onClick={onGoHome}>
            Ir al inicio
          </Button>
        ) : null}
      </div>
    </ErrorState>
  );
}
