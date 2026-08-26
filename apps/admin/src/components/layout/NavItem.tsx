import type { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '@vitalock/ui';

interface NavItemProps {
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
}

export function NavItem({ label, to, icon, badge, excludeSubpaths }: NavItemProps) {
  const showBadge = badge != null && badge > 0;
  const { pathname } = useLocation();
  const isExcluded = excludeSubpaths?.some(
    (p) => pathname === p || pathname.startsWith(p + '/'),
  );

  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'flex w-full items-center gap-2 rounded-[9px] px-4 py-2 text-[14px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
          isActive &&
            !isExcluded &&
            'rounded-[9px] bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground',
        )
      }
    >
      {icon}
      <span>{label}</span>
      {showBadge && (
        <span className="ml-auto rounded-[20px] bg-success px-2 py-0.5 text-[12px] font-bold text-white">
          {badge}
        </span>
      )}
    </NavLink>
  );
}
