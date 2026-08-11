import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { cn } from '@vitalock/ui';

interface NavItemProps {
  label: string;
  to: string;
  icon?: ReactNode;
}

export function NavItem({ label, to, icon }: NavItemProps) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground',
          isActive
            ? 'bg-accent font-medium text-accent-foreground'
            : 'text-muted-foreground',
        )
      }
    >
      {icon}
      <span>{label}</span>
    </NavLink>
  );
}
