import { Outlet } from 'react-router-dom';
import { useAuthContext } from '@/auth/AuthProvider';
import { Button } from '@/components/ui/button';
import { Sidebar } from './Sidebar';
import { ThemeToggle } from './ThemeToggle';

export function AppShell() {
  const { staff, signOut } = useAuthContext();

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b bg-background px-4">
        <span className="text-sm font-semibold">Vitalock Admin</span>
        <div className="flex items-center gap-3">
          {staff && (
            <span className="hidden text-sm text-muted-foreground md:block">
              {staff.full_name}
            </span>
          )}
          <ThemeToggle />
          <Button variant="ghost" size="sm" onClick={() => void signOut()}>
            Salir
          </Button>
        </div>
      </header>

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
