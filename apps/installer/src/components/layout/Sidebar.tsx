import { History, LayoutDashboard, ListTodo } from 'lucide-react';
import { cn } from '@vitalock/ui';
import { NavItem } from './NavItem';
import { UserMenu } from './UserMenu';

interface SidebarProps {
  className?: string;
}

interface SidebarNavProps {
  /**
   * Whether to render the brand logo header. Desktop sidebar shows it;
   * the mobile drawer hides it because the mobile topbar already carries
   * the brand.
   */
  showLogo?: boolean;
}

export function SidebarNav({ showLogo = true }: SidebarNavProps = {}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      {showLogo && (
        <div className="flex shrink-0 items-center gap-2.5 px-6 py-4">
          <img
            src={`${import.meta.env.BASE_URL}Vitalock_logo_vector_black.svg`}
            alt="Vitalock"
            className="block h-8 w-auto dark:hidden"
          />
          <img
            src={`${import.meta.env.BASE_URL}Vitalock_logo_vector_white.svg`}
            alt=""
            aria-hidden="true"
            className="hidden h-8 w-auto dark:block"
          />
        </div>
      )}

      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-4 pt-4 pb-4">
        <NavItem
          label="Dashboard"
          to="/"
          end
          icon={<LayoutDashboard className="h-4 w-4" />}
        />
        <NavItem
          label="Tareas"
          to="/tareas"
          icon={<ListTodo className="h-4 w-4" />}
        />
        <NavItem
          label="Historial"
          to="/historial"
          icon={<History className="h-4 w-4" />}
        />
      </nav>

      <div className="shrink-0 border-t">
        <UserMenu />
      </div>
    </div>
  );
}

export function Sidebar({ className }: SidebarProps) {
  return (
    <aside
      className={cn(
        'hidden w-[240px] shrink-0 flex-col border-r bg-card md:flex',
        className,
      )}
    >
      <SidebarNav />
    </aside>
  );
}
