import { AppShell as AppShellBase, MobileSidebar, useSidebarCollapsed } from '@vitalock/ui';
import { AdminNav } from './AdminNav';
import { Sidebar } from './Sidebar';
import { UserMenu } from './UserMenu';
import { adminLogo } from './brand';

export function AppShell() {
  const [collapsed, toggle] = useSidebarCollapsed();

  return (
    <AppShellBase
      logo={adminLogo}
      sidebar={<Sidebar collapsed={collapsed} onToggle={toggle} />}
      mobileSidebar={
        <MobileSidebar footer={<UserMenu />}>
          <AdminNav />
        </MobileSidebar>
      }
    />
  );
}
