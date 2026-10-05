import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '../../lib/utils';

export type EmptyStateProps = { className?: string } & (
  | {
      /** Compact form: a single muted line. */
      message: string;
    }
  | {
      /** Rich form: centred column with optional icon, description and action. */
      title: string;
      description?: ReactNode;
      icon?: LucideIcon;
      action?: ReactNode;
    }
);

export function EmptyState(props: EmptyStateProps) {
  if ('message' in props) {
    return <p className={cn('text-muted-foreground text-sm', props.className)}>{props.message}</p>;
  }

  const { title, description, icon: Icon, action, className } = props;
  return (
    <div className={cn('flex flex-col items-center justify-center py-8 text-center', className)}>
      {Icon ? (
        <div
          aria-hidden="true"
          className="bg-muted text-muted-foreground mb-3 flex size-10 items-center justify-center rounded-full"
        >
          <Icon className="h-5 w-5" />
        </div>
      ) : null}
      <p className="text-headline">{title}</p>
      {description != null ? (
        <p className="text-callout text-muted-foreground mt-1">{description}</p>
      ) : null}
      {action != null ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
