import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { MobileSidebar } from './MobileSidebar';
import { useSidebarCollapsed } from '../../hooks/useSidebarCollapsed';

export function AppShell() {
  const [collapsed, toggle] = useSidebarCollapsed();

  return (
    <div className="flex h-screen flex-col">
      {/* Mobile-only topbar: hamburger on the left (matches the desktop
          sidebar's spatial model) followed by the brand. Hidden on md+
          where the desktop sidebar carries brand + nav + user menu. */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-card px-2 md:hidden">
        <MobileSidebar />
        <div className="flex items-center gap-2.5">
          <img
            src={`${import.meta.env.BASE_URL}Vitalock_logo_vector_black.svg`}
            alt="Vitalock"
            className="block h-7 w-auto dark:hidden"
          />
          <img
            src={`${import.meta.env.BASE_URL}Vitalock_logo_vector_white.svg`}
            alt=""
            aria-hidden="true"
            className="hidden h-7 w-auto dark:block"
          />
        </div>
      </header>

      <div className="flex w-full min-h-0 flex-1">
        <Sidebar collapsed={collapsed} onToggle={toggle} />
        <main className="min-w-0 flex-1 overflow-auto bg-content px-6 pt-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
