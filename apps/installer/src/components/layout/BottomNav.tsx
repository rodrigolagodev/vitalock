import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { History, LayoutDashboard, ListTodo } from 'lucide-react';
import { cn } from '@vitalock/ui';

interface BottomNavItemProps {
  label: string;
  to: string;
  icon: ReactNode;
  end?: boolean;
}

function BottomNavItem({ label, to, icon, end }: BottomNavItemProps) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex flex-1 flex-col items-center justify-center gap-1 py-2 text-xs font-medium text-muted-foreground transition-colors',
          isActive && 'text-primary',
        )
      }
    >
      {icon}
      <span>{label}</span>
    </NavLink>
  );
}

/**
 * Mobile-only bottom navigation bar. Provides one-tap access to the three
 * installer surfaces. Hidden on md+ where the desktop sidebar is visible.
 */
export function BottomNav() {
  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-40 flex h-[64px] shrink-0 items-stretch border-t bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <BottomNavItem
        label="Dashboard"
        to="/"
        end
        icon={<LayoutDashboard className="h-5 w-5" />}
      />
      <BottomNavItem
        label="Tareas"
        to="/tareas"
        icon={<ListTodo className="h-5 w-5" />}
      />
      <BottomNavItem
        label="Historial"
        to="/historial"
        icon={<History className="h-5 w-5" />}
      />
    </nav>
  );
}
