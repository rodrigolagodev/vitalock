import {
  Building2,
  ChevronLeft,
  ChevronRight,
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
  /** When true, renders icon-only (64px) with tooltips; labels hidden. */
  collapsed?: boolean;
  /** Called when the collapse toggle button is activated. */
  onToggle?: () => void;
}

interface SidebarNavProps {
  /**
   * Whether to render the brand logo header. Desktop sidebar shows it;
   * the mobile drawer hides it because the mobile topbar already carries
   * the brand — avoids showing the logo twice.
   */
  showLogo?: boolean;
  /** When true, renders icon-only (64px) with tooltips; labels hidden. */
  collapsed?: boolean;
  /** Called when the collapse toggle button is activated. */
  onToggle?: () => void;
}

/** Small icon mark shown in the collapsed brand header in place of the logo. */
function BrandMark() {
  return (
    <span
      aria-hidden="true"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"
    >
      <Building2 className="h-4 w-4" />
    </span>
  );
}

/**
 * Full sidebar content — logo + grouped links + user menu pinned to the
 * bottom. Shared between the desktop `Sidebar` (visible on md+) and the
 * mobile `MobileSidebar` drawer.
 */
export function SidebarNav({
  showLogo = true,
  collapsed = false,
  onToggle,
}: SidebarNavProps = {}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      {showLogo && (
        <div
          className={cn(
            'flex shrink-0 items-center gap-2.5 py-4',
            collapsed ? 'justify-center px-0' : 'px-6',
          )}
        >
          {collapsed ? (
            <BrandMark />
          ) : (
            <>
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
            </>
          )}
        </div>
      )}

      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden px-2 pt-4 pb-4">
        <SidebarGroup label="Clientes" collapsed={collapsed}>
          <NavItem
            label="Administraciones"
            to="/administraciones"
            icon={<Building2 className="h-4 w-4" />}
            collapsed={collapsed}
          />
          <NavItem
            label="Particulares"
            to="/particulares"
            icon={<Home className="h-4 w-4" />}
            collapsed={collapsed}
          />
        </SidebarGroup>

        <SidebarGroup label="Llaves" collapsed={collapsed}>
          <NavItem
            label="Órdenes de llaves"
            to="/llaves"
            icon={<Key className="h-4 w-4" />}
            excludeSubpaths={['/llaves/inventario']}
            collapsed={collapsed}
          />
          <NavItem
            label="Inventario"
            to="/llaves/inventario"
            icon={<ListChecks className="h-4 w-4" />}
            collapsed={collapsed}
          />
        </SidebarGroup>

        <SidebarGroup label="Equipos" collapsed={collapsed}>
          <NavItem
            label="Servicio técnico"
            to="/servicio-tecnico"
            icon={<Wrench className="h-4 w-4" />}
            collapsed={collapsed}
          />
          <NavItem
            label="Inventario"
            to="/equipos"
            icon={<HardDrive className="h-4 w-4" />}
            collapsed={collapsed}
          />
        </SidebarGroup>

        <SidebarGroup label="Operación" collapsed={collapsed}>
          <NavItem
            label="Órdenes"
            to="/ordenes"
            icon={<History className="h-4 w-4" />}
            collapsed={collapsed}
          />
          <NavItem
            label="Tareas"
            to="/tareas"
            icon={<ListTodo className="h-4 w-4" />}
            collapsed={collapsed}
          />
          <NavItem
            label="Stock"
            to="/stock"
            icon={<Package className="h-4 w-4" />}
            collapsed={collapsed}
          />
        </SidebarGroup>

        <SidebarGroup label="Equipo interno" collapsed={collapsed}>
          <NavItem
            label="Personal"
            to="/personal"
            icon={<Users className="h-4 w-4" />}
            collapsed={collapsed}
          />
        </SidebarGroup>
      </nav>

      <div className="shrink-0 border-t">
        <UserMenu collapsed={collapsed} />
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={collapsed}
          aria-label="Toggle sidebar"
          className="flex h-11 w-full items-center justify-center border-t text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:bg-muted"
        >
          {collapsed ? (
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          ) : (
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          )}
        </button>
      </div>
    </div>
  );
}

export function Sidebar({ className, collapsed = false, onToggle }: SidebarProps) {
  // aria-expanded on the sidebar is required by the admin-shell spec; the a11y
  // rule flags it because <aside> maps to role complementary. The disclosure
  // semantics are nevertheless required by the design system.
  /* eslint-disable jsx-a11y/role-supports-aria-props */
  return (
    <aside
      aria-expanded={!collapsed}
      className={cn(
        'hidden shrink-0 flex-col overflow-hidden border-r bg-card transition-[width] duration-300 ease-in-out motion-reduce:transition-none md:flex',
        collapsed ? 'w-[64px]' : 'w-[240px]',
        className,
      )}
    >
      <SidebarNav collapsed={collapsed} onToggle={onToggle} />
    </aside>
  );
  /* eslint-enable jsx-a11y/role-supports-aria-props */
}
