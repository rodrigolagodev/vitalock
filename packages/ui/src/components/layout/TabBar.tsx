import type { LucideIcon } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { cn } from '../../lib/utils';

export interface TabBarItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Match only the exact path (use for the root destination). */
  end?: boolean;
}

export interface TabBarProps {
  items: TabBarItem[];
  /** Accessible name of the navigation landmark. Defaults to "Principal". */
  'aria-label'?: string;
  className?: string;
}

/**
 * Bottom tab bar: a 49px row (plus the bottom safe area) of icon + label
 * links on a translucent surface. `NavLink` provides `aria-current="page"`
 * for the active tab, including nested routes.
 */
export function TabBar({ items, 'aria-label': ariaLabel = 'Principal', className }: TabBarProps) {
  return (
    <nav
      aria-label={ariaLabel}
      className={cn('bg-card/90 pb-safe-b shrink-0 border-t backdrop-blur', className)}
    >
      <div
        className="h-tab-bar mx-auto grid max-w-md"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'min-h-control-md focus-visible:ring-ring flex flex-col items-center justify-center gap-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset',
                isActive ? 'text-primary' : 'text-muted-foreground',
              )
            }
          >
            <Icon aria-hidden="true" className="h-6 w-6" />
            <span className="text-caption">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
