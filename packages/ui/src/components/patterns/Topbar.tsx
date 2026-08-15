import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

export interface TopbarProps {
  /** Avatar initials rendered before the divider (e.g. derived from the signed-in staff name). */
  avatar?: string;
  /** Right slot after the divider: theme toggle + sign-out, etc. */
  children?: ReactNode;
  className?: string;
}

/**
 * Router-free topbar: avatar initials, divider, and a children slot for
 * actions (theme toggle, sign-out, etc.).
 */
export function Topbar({ avatar, children, className }: TopbarProps) {
  return (
    <header
      className={cn(
        'flex h-[60px] shrink-0 items-center justify-end gap-4 border-b bg-white px-6',
        className,
      )}
    >
      <div className="flex items-center gap-3">
        {avatar && (
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f1f5f9] text-[14px] font-medium text-[#40444d]">
            {avatar}
          </span>
        )}
        <div
          data-testid="topbar-divider"
          aria-hidden="true"
          className="h-[32px] w-px bg-[#e2e8f0]"
        />
        {children}
      </div>
    </header>
  );
}
