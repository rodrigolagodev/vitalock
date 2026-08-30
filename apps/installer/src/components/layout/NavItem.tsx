import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { cn } from '@vitalock/ui';

interface NavItemProps {
  label: string;
  to: string;
  icon?: ReactNode;
  badge?: number;
  end?: boolean;
}

export function NavItem({ label, to, icon, badge, end }: NavItemProps) {
  const showBadge = badge != null && badge > 0;

  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex w-full items-center gap-2 rounded-lg px-4 py-2 text-base font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
          isActive &&
            'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground',
        )
      }
    >
      {icon}
      <span>{label}</span>
      {showBadge && (
        <span className="ml-auto rounded-full bg-success px-2 py-0.5 text-xs font-bold text-white">
          {badge}
        </span>
      )}
    </NavLink>
  );
}
