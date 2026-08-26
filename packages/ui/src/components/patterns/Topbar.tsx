import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

export interface TopbarProps {
  /** Left slot before the flexible spacer: hamburger menu trigger, breadcrumbs, etc. */
  leading?: ReactNode;
  /** Avatar initials rendered before the divider (e.g. derived from the signed-in staff name). */
  avatar?: string;
  /** Right slot after the divider: theme toggle + sign-out, etc. */
  children?: ReactNode;
  className?: string;
}

/**
 * Router-free topbar: optional leading slot, avatar initials, divider, and
 * a children slot for right-side actions (theme toggle, sign-out, etc.).
 */
export function Topbar({ leading, avatar, children, className }: TopbarProps) {
  return (
    <header
      className={cn(
        'flex h-[60px] shrink-0 items-center gap-4 border-b bg-card px-6',
        className,
      )}
    >
      {leading && <div className="flex items-center gap-2">{leading}</div>}
      <div className="ml-auto flex items-center gap-3">
        {avatar && (
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-[14px] font-medium text-muted-foreground">
            {avatar}
          </span>
        )}
        <div
          data-testid="topbar-divider"
          aria-hidden="true"
          className="h-[32px] w-px bg-border"
        />
        {children}
      </div>
    </header>
  );
}
