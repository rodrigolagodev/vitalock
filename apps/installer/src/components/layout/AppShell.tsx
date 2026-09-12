import { AppShell as AppShellBase, MobileSidebar, useSidebarCollapsed } from '@vitalock/ui';
import { InstallerNav } from './InstallerNav';
import { Sidebar } from './Sidebar';
import { UserMenu } from './UserMenu';
import { installerLogo } from './brand';

/**
 * Installer app shell: the shared frame (mobile topbar with hamburger
 * drawer, collapsible desktop sidebar, scrolling main) composed with the
 * installer nav tree and user menu. Structurally identical to the admin.
 */
export function AppShell() {
  const [collapsed, toggle] = useSidebarCollapsed();

  return (
    <AppShellBase
      logo={installerLogo}
      sidebar={<Sidebar collapsed={collapsed} onToggle={toggle} />}
      mobileSidebar={
        <MobileSidebar footer={<UserMenu />}>
          <InstallerNav />
        </MobileSidebar>
      }
    />
  );
}
