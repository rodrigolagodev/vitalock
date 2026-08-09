import { NavLink } from 'react-router-dom';
import { cn } from '@vitalock/ui';

interface NavItemProps {
  label: string;
  to: string;
}

export function NavItem({ label, to }: NavItemProps) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'block rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground',
          isActive
            ? 'bg-accent font-medium text-accent-foreground'
            : 'text-muted-foreground',
        )
      }
    >
      {label}
    </NavLink>
  );
}
