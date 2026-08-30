import {
  Building2,
  HardDrive,
  History,
  Home,
  Key,
  ListChecks,
  ListTodo,
  Package,
  Users,
  Wrench,
} from 'lucide-react';
import { cn, SidebarGroup } from '@vitalock/ui';
import { NavItem } from './NavItem';
import { UserMenu } from './UserMenu';

interface SidebarProps {
  className?: string;
}

interface SidebarNavProps {
  /**
   * Whether to render the brand logo header. Desktop sidebar shows it;
   * the mobile drawer hides it because the mobile topbar already carries
   * the brand — avoids showing the logo twice.
   */
  showLogo?: boolean;
}

/**
 * Full sidebar content — logo + grouped links + user menu pinned to the
 * bottom. Shared between the desktop `Sidebar` (visible on md+) and the
 * mobile `MobileSidebar` drawer.
 */
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
        <SidebarGroup label="Clientes">
          <NavItem
            label="Administraciones"
            to="/administraciones"
            icon={<Building2 className="h-4 w-4" />}
          />
          <NavItem
            label="Particulares"
            to="/particulares"
            icon={<Home className="h-4 w-4" />}
          />
        </SidebarGroup>

        <SidebarGroup label="Llaves">
          <NavItem
            label="Órdenes de llaves"
            to="/llaves"
            icon={<Key className="h-4 w-4" />}
            excludeSubpaths={['/llaves/inventario']}
          />
          <NavItem
            label="Inventario"
            to="/llaves/inventario"
            icon={<ListChecks className="h-4 w-4" />}
          />
        </SidebarGroup>

        <SidebarGroup label="Equipos">
          <NavItem
            label="Servicio técnico"
            to="/servicio-tecnico"
            icon={<Wrench className="h-4 w-4" />}
          />
          <NavItem
            label="Inventario"
            to="/equipos"
            icon={<HardDrive className="h-4 w-4" />}
          />
        </SidebarGroup>

        <SidebarGroup label="Operación">
          <NavItem
            label="Órdenes"
            to="/ordenes"
            icon={<History className="h-4 w-4" />}
          />
          <NavItem
            label="Tareas"
            to="/tareas"
            icon={<ListTodo className="h-4 w-4" />}
          />
          <NavItem
            label="Stock"
            to="/stock"
            icon={<Package className="h-4 w-4" />}
          />
        </SidebarGroup>

        <SidebarGroup label="Equipo interno">
          <NavItem
            label="Personal"
            to="/personal"
            icon={<Users className="h-4 w-4" />}
          />
        </SidebarGroup>
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
