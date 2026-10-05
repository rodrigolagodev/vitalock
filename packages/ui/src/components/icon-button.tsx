import * as React from 'react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '../lib/utils';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  /** Accessible name; required — icon-only controls must be announced. */
  label: string;
  /** Pulses the icon while true and disables the button. */
  loading?: boolean;
  /** Icon color classes; default inherits the muted foreground. */
  iconClassName?: string;
}

/**
 * Naked icon button for dense surfaces (table row actions).
 *
 * No visible box: the icon renders at 16px with tight padding (28px
 * visual box) and the hover state reveals the background. An `after:`
 * pseudo-element grows the hit area to 44px without widening the layout. Use `iconClassName`
 * for semantic colors (e.g. destructive actions pass "text-destructive").
 */
const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon: Icon, label, loading = false, iconClassName, className, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        aria-label={label}
        disabled={disabled || loading}
        className={cn(
          'rounded-control after:size-control-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring relative inline-flex items-center justify-center p-1.5 transition-colors after:absolute after:left-1/2 after:top-1/2 after:-translate-x-1/2 after:-translate-y-1/2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
          className,
        )}
        {...props}
      >
        <Icon className={cn('h-4 w-4', iconClassName, loading && 'animate-pulse')} />
      </button>
    );
  },
);
IconButton.displayName = 'IconButton';

export { IconButton };
