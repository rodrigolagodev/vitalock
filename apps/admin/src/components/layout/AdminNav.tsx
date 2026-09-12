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
import { NavItem, SidebarGroup } from '@vitalock/ui';

interface AdminNavProps {
  /** When true, renders icon-only with tooltips; labels hidden. */
  collapsed?: boolean;
}

/**
 * Admin navigation tree. Shared by the desktop `Sidebar` and the mobile
 * drawer so both always list the same sections and links.
 */
export function AdminNav({ collapsed = false }: AdminNavProps) {
  return (
    <>
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
    </>
  );
}
