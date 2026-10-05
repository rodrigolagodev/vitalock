import { Outlet } from 'react-router-dom';
import { History, LayoutDashboard, ListTodo } from 'lucide-react';
import { BrandLogoImages, TabBar, type TabBarItem } from '@vitalock/ui';
import { ConnectivityBanner } from '@/components/common/ConnectivityBanner';
import { UserMenu } from './UserMenu';
import { installerLogo } from './brand';

const TABS: TabBarItem[] = [
  { to: '/', label: 'Inicio', icon: LayoutDashboard, end: true },
  { to: '/tareas', label: 'Tareas', icon: ListTodo },
  { to: '/historial', label: 'Historial', icon: History },
];

/**
 * Installer app shell for a phone PWA: a safe-area aware top bar (logo and
 * user menu), the connectivity banner, the scrolling main area and a bottom
 * tab bar at every viewport width. Pages own their bottom spacing.
 */
export function AppShell() {
  return (
    <div className="flex h-dvh flex-col">
      <header className="bg-card pt-safe-t shrink-0 border-b">
        <div className="flex h-14 items-center justify-between px-4">
          <BrandLogoImages logo={installerLogo} className="h-7" />
          <UserMenu variant="toolbar" />
        </div>
      </header>
      <ConnectivityBanner />
      <main className="bg-content min-h-0 flex-1 overflow-auto px-4 pt-4">
        <Outlet />
      </main>
      <TabBar items={TABS} />
    </div>
  );
}
