import type { ReactNode } from 'react';
import { ChevronsUpDown, LogOut } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../button';
import { Popover, PopoverContent, PopoverTrigger } from '../popover';

/** Up to two uppercase initials from a full name (`"Ana Alvarez"` → `"AA"`). */
export function initialsFromName(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export interface UserMenuProps {
  /** Display name of the signed-in user. */
  name: string;
  /** Secondary line shown under the name (trigger + popover header), e.g. `@username`. Hidden when empty. */
  subtitle?: string;
  /** Invoked by the "Salir" action. */
  onSignOut: () => void | Promise<void>;
  /** When true, hides name/subtitle visually and from AT; the avatar stays. Layout size never changes. */
  collapsed?: boolean;
  /**
   * Theme-toggle row slot rendered inside the popover next to the "Tema"
   * label. Apps own the theme runtime (e.g. next-themes), so they pass
   * their own toggle. The row is omitted when no children are given.
   */
  children?: ReactNode;
}

/**
 * Sidebar user menu: initials avatar + name/subtitle trigger that opens a
 * popover with the account header, an optional theme row and sign-out.
 */
export function UserMenu({
  name,
  subtitle = '',
  onSignOut,
  collapsed = false,
  children,
}: UserMenuProps) {
  const initials = initialsFromName(name) || 'US';

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="hover:bg-muted focus-visible:bg-muted flex w-full items-center gap-3 px-3 py-3 text-left transition-colors focus-visible:outline-none"
          aria-label="Abrir menú de usuario"
        >
          <span className="bg-muted text-muted-foreground flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-medium">
            {initials}
          </span>
          <div
            className={cn(
              'flex min-w-0 flex-1 flex-col transition-opacity duration-200',
              collapsed && 'opacity-0',
            )}
            aria-hidden={collapsed}
          >
            <span className="truncate text-sm font-medium">{name}</span>
            {subtitle && <span className="text-muted-foreground truncate text-xs">{subtitle}</span>}
          </div>
          <ChevronsUpDown
            className={cn(
              'text-muted-foreground h-4 w-4 shrink-0 transition-opacity duration-200',
              collapsed && 'opacity-0',
            )}
            aria-hidden="true"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" sideOffset={8} className="w-[248px] p-0">
        <div className="flex flex-col gap-0.5 border-b px-3 py-3">
          <span className="truncate text-sm font-medium">{name}</span>
          {subtitle && <span className="text-muted-foreground truncate text-xs">{subtitle}</span>}
        </div>
        {children != null && (
          <div className="flex items-center justify-between px-3 py-2.5">
            <span className="text-sm">Tema</span>
            {children}
          </div>
        )}
        <div className="border-t p-1">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2"
            onClick={() => void onSignOut()}
          >
            <LogOut className="h-4 w-4" />
            Salir
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
