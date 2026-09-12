import { Sidebar as SidebarBase } from '@vitalock/ui';
import { InstallerNav } from './InstallerNav';
import { UserMenu } from './UserMenu';
import { installerLogo } from './brand';

interface SidebarProps {
  className?: string;
  /** When true, renders icon-only (64px) with tooltips; labels hidden. */
  collapsed?: boolean;
  /** Called when the collapse toggle button is activated. */
  onToggle?: () => void;
}

/** Desktop installer sidebar: shared shell + installer nav tree + user menu footer. */
export function Sidebar({ className, collapsed = false, onToggle }: SidebarProps) {
  return (
    <SidebarBase
      className={className}
      collapsed={collapsed}
      onToggle={onToggle}
      logo={installerLogo}
      footer={<UserMenu collapsed={collapsed} />}
    >
      <InstallerNav collapsed={collapsed} />
    </SidebarBase>
  );
}
