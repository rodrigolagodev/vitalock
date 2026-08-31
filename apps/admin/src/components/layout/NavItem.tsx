import type { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { cn, Tooltip } from '@vitalock/ui';

export interface NavItemProps {
  label: string;
  to: string;
  icon?: ReactNode;
  /** Badge pill count; hidden when null/undefined or <= 0. */
  badge?: number;
  /**
   * Subpaths that should NOT count as "this item active", even though NavLink's
   * prefix matcher would normally include them. Used to prevent a parent nav
   * item (e.g. /llaves) from lighting up while a sibling on a nested route
   * (e.g. /llaves/inventario) is the real active item.
   */
  excludeSubpaths?: string[];
  /** When true, hides the label + badge visually and wraps the trigger in a Tooltip. Layout size stays identical to expanded so icons never jump. */
  collapsed?: boolean;
}

export function NavItem({
  label,
  to,
  icon,
  badge,
  excludeSubpaths,
  collapsed = false,
}: NavItemProps) {
  const showBadge = badge != null && badge > 0;
  const { pathname } = useLocation();
  const isExcluded = excludeSubpaths?.some(
    (p) => pathname === p || pathname.startsWith(p + '/'),
  );
  // NavLink's function-form className is stringified by Radix Slot (used by
  // Tooltip's asChild trigger), which drops all Tailwind classes. Compute
  // active state manually and pass a string.
  const isActive =
    (pathname === to || pathname.startsWith(to + '/')) && !isExcluded;

  // Layout stays identical between collapsed and expanded: same size, same
  // padding, same icon position. The aside width transition alone reveals or
  // clips the label; nothing in the DOM structure changes on toggle, so icons
  // never jump or flicker.
  const linkClassName = cn(
    'flex h-11 w-full items-center gap-2 rounded-lg px-4 text-base font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
    isActive &&
      'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground',
  );

  const inner = (
    <NavLink to={to} aria-label={label} className={linkClassName}>
      <span className="flex h-4 w-4 shrink-0 items-center justify-center">
        {icon}
      </span>
      <span
        className={cn(
          'whitespace-nowrap transition-opacity duration-200',
          collapsed && 'opacity-0',
        )}
        aria-hidden={collapsed}
      >
        {label}
      </span>
      {showBadge && (
        <span
          className={cn(
            'ml-auto rounded-full bg-success px-2 py-0.5 text-xs font-bold text-white transition-opacity duration-200',
            collapsed && 'opacity-0',
          )}
          aria-hidden={collapsed}
        >
          {badge}
        </span>
      )}
    </NavLink>
  );

  if (!collapsed) {
    return inner;
  }

  return (
    <Tooltip content={label} side="right" sideOffset={8} delayDuration={0}>
      {inner}
    </Tooltip>
  );
}
