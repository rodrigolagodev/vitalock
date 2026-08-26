import { Outlet } from 'react-router-dom';
import { Button, Topbar } from '@vitalock/ui';
import { useAuthContext } from '@vitalock/shared';
import { Sidebar } from './Sidebar';
import { MobileSidebar } from './MobileSidebar';
import { ThemeToggle } from './ThemeToggle';

export function AppShell() {
  const { staff, signOut } = useAuthContext();

  const initials = staff?.full_name
    ? staff.full_name
        .split(/\s+/)
        .map((part) => part[0])
        .filter(Boolean)
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : '';

  return (
    <div className="flex h-screen flex-col">
      {/* Body: fixed sidebar + content column with its own topbar */}
      <div className="flex w-full min-h-0 flex-1">
        <Sidebar />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/* Topbar: leading slot carries the mobile hamburger; right slot carries theme + sign-out */}
          <Topbar leading={<MobileSidebar />} avatar={initials}>
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={() => void signOut()}>
              Salir
            </Button>
          </Topbar>

          {/* Content surface. min-w-0 lets wide children (tables, code) scroll
              inside their own container instead of stretching the whole page. */}
          <main className="min-w-0 flex-1 bg-content p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
