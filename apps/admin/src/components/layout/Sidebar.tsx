import { Sidebar as SidebarBase } from '@vitalock/ui';
import { AdminNav } from './AdminNav';
import { UserMenu } from './UserMenu';
import { adminLogo } from './brand';

interface SidebarProps {
  className?: string;
  /** When true, renders icon-only (64px) with tooltips; labels hidden. */
  collapsed?: boolean;
  /** Called when the collapse toggle button is activated. */
  onToggle?: () => void;
}

/** Desktop admin sidebar: shared shell + admin nav tree + user menu footer. */
export function Sidebar({ className, collapsed = false, onToggle }: SidebarProps) {
  return (
    <SidebarBase
      className={className}
      collapsed={collapsed}
      onToggle={onToggle}
      logo={adminLogo}
      footer={<UserMenu collapsed={collapsed} />}
    >
      <AdminNav collapsed={collapsed} />
    </SidebarBase>
  );
}
