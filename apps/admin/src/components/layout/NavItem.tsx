import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { cn } from '@vitalock/ui';

interface NavItemProps {
  label: string;
  to: string;
  icon?: ReactNode;
  /** Badge pill count; hidden when null/undefined or <= 0. */
  badge?: number;
}

export function NavItem({ label, to, icon, badge }: NavItemProps) {
  const showBadge = badge != null && badge > 0;

  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'flex h-12 items-center gap-2 rounded-md px-3 text-sm transition-colors hover:bg-accent hover:text-accent-foreground',
          isActive
            ? 'bg-accent font-medium text-accent-foreground'
            : 'text-muted-foreground',
        )
      }
    >
      {icon}
      <span>{label}</span>
      {showBadge && (
        <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
          {badge}
        </span>
      )}
    </NavLink>
  );
}
