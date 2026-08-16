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
          'flex w-full items-center gap-2 rounded-[9px] px-4 py-2 text-[14px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
          isActive &&
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
