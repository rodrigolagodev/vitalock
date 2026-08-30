import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/utils';

export interface ErrorStateProps {
  message: string;
  /** Optional back link rendered under the message. */
  back?: { label: string; to: string };
  /** Optional custom action rendered under the message. */
  children?: ReactNode;
  className?: string;
}

export function ErrorState({ message, back, children, className }: ErrorStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-12 text-center',
        className,
      )}
    >
      <p className="text-sm text-destructive">{message}</p>
      {children}
      {back ? (
        <Link to={back.to} className="mt-4 text-sm underline">
          {back.label}
        </Link>
      ) : null}
    </div>
  );
}