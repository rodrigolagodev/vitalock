import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { Button } from '../button';

export interface ErrorStateProps {
  message: string;
  /** Optional back link rendered under the message. */
  back?: { label: string; to: string };
  /** Optional custom action rendered under the message (after the retry button). */
  children?: ReactNode;
  className?: string;
  /** When set, renders an outline retry button that calls it. */
  onRetry?: () => void;
  /** Retry button label. Defaults to "Reintentar". */
  retryLabel?: string;
}

export function ErrorState({
  message,
  back,
  children,
  className,
  onRetry,
  retryLabel = 'Reintentar',
}: ErrorStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-12 text-center', className)}>
      <p className="text-destructive text-sm">{message}</p>
      {onRetry ? (
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button type="button" variant="outline" onClick={onRetry}>
            {retryLabel}
          </Button>
          {children}
        </div>
      ) : (
        children
      )}
      {back ? (
        <Link to={back.to} className="mt-4 text-sm underline">
          {back.label}
        </Link>
      ) : null}
    </div>
  );
}
