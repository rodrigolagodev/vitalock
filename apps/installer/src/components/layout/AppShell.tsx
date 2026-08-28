import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';
import { MobileTopbarUserButton } from './MobileTopbarUserButton';

/**
 * Installer app shell.
 *
 * Desktop (md+): brand sidebar on the left (with UserMenu pinned to the
 * bottom) + main content area, mirroring the admin app.
 *
 * Mobile: a compact topbar (brand + user avatar popover) and a fixed
 * bottom navigation bar with the three installer surfaces
 * (Dashboard / Tareas / Historial). Optimized for one-hand use in the
 * field, which is where installers spend most of their day.
 */
export function AppShell() {
  return (
    <div className="flex h-screen flex-col">
      {/* Mobile-only topbar */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b bg-card px-4 md:hidden">
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
        <MobileTopbarUserButton />
      </header>

      <div className="flex w-full min-h-0 flex-1">
        <Sidebar />
        {/* Main content — extra bottom padding on mobile so the fixed
            BottomNav (64px + safe-area) never overlaps the last item. */}
        <main className="min-w-0 flex-1 overflow-auto bg-content pb-[calc(64px+env(safe-area-inset-bottom))] md:pb-0">
          <Outlet />
        </main>
      </div>

      <BottomNav />
    </div>
  );
}
