import type { ReactNode } from 'react';
import { Bell } from 'lucide-react';
import { cn } from '../../lib/utils';
import { SearchInput } from './SearchInput';

export interface TopbarProps {
  /** Avatar initials rendered before the divider (e.g. derived from the signed-in staff name). */
  avatar?: string;
  /** Right slot after the divider: theme toggle + sign-out, etc. */
  children?: ReactNode;
  className?: string;
}

/**
 * Router-free topbar: search field (visual placeholder), notification bell,
 * avatar initials, divider, and a children slot for actions.
 */
export function Topbar({ avatar, children, className }: TopbarProps) {
  return (
    <header
      className={cn(
        'flex h-16 shrink-0 items-center justify-between gap-4 border-b bg-background px-6',
        className,
      )}
    >
      <div className="hidden items-center gap-3 md:flex">
        <SearchInput size="lg" placeholder="Buscar..." aria-label="Buscar" />
        <button
          type="button"
          aria-label="Notificaciones"
          className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <Bell className="h-5 w-5" />
        </button>
      </div>

      <div className="flex items-center gap-3">
        {avatar && (
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
            {avatar}
          </span>
        )}
        <div
          data-testid="topbar-divider"
          aria-hidden="true"
          className="h-6 w-px bg-border"
        />
        {children}
      </div>
    </header>
  );
}
