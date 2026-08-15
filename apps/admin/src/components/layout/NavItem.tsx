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
          'flex w-full items-center gap-2 rounded-[9px] px-4 py-2 text-[14px] font-medium text-[#3b424a] transition-colors hover:bg-accent hover:text-accent-foreground',
          isActive &&
            'rounded-[9px] bg-[#7364ff] text-white hover:bg-[#7364ff] hover:text-white',
        )
      }
    >
      {icon}
      <span>{label}</span>
      {showBadge && (
        <span className="ml-auto rounded-[20px] bg-[#10b981] px-2 py-0.5 text-[12px] font-bold text-white">
          {badge}
        </span>
      )}
    </NavLink>
  );
}
