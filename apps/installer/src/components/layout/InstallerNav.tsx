import { History, LayoutDashboard, ListTodo } from 'lucide-react';
import { NavItem, SidebarGroup } from '@vitalock/ui';

interface InstallerNavProps {
  /** When true, renders icon-only with tooltips; labels hidden. */
  collapsed?: boolean;
}

/**
 * Installer navigation tree. Shared by the desktop `Sidebar` and the mobile
 * drawer so both always list the same links.
 */
export function InstallerNav({ collapsed = false }: InstallerNavProps) {
  return (
    <SidebarGroup label="Trabajo" collapsed={collapsed}>
      <NavItem
        label="Dashboard"
        to="/"
        end
        icon={<LayoutDashboard className="h-4 w-4" />}
        collapsed={collapsed}
      />
      <NavItem
        label="Tareas"
        to="/tareas"
        icon={<ListTodo className="h-4 w-4" />}
        collapsed={collapsed}
      />
      <NavItem
        label="Historial"
        to="/historial"
        icon={<History className="h-4 w-4" />}
        collapsed={collapsed}
      />
    </SidebarGroup>
  );
}
