import { cn } from '../../lib/utils';

export interface EmptyStateProps {
  message: string;
  className?: string;
}

export function EmptyState({ message, className }: EmptyStateProps) {
  return <p className={cn('text-sm text-muted-foreground', className)}>{message}</p>;
}