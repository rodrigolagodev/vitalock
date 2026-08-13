import { Outlet } from 'react-router-dom';
import { Button, Topbar } from '@vitalock/ui';
import { useAuthContext } from '@/auth/AuthProvider';
import { Sidebar } from './Sidebar';
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
      {/* Topbar: search + bell + avatar + divider; slot carries theme + sign-out */}
      <Topbar avatar={initials}>
        <ThemeToggle />
        <Button variant="ghost" size="sm" onClick={() => void signOut()}>
          Salir
        </Button>
      </Topbar>

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
