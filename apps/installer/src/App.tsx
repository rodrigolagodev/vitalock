import { Outlet } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { ThemeToggle } from '@/components/common/ThemeToggle';

export default function App() {
  return (
    <main className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex h-14 shrink-0 items-center justify-between border-b bg-card px-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <KeyRound className="h-4 w-4" />
          </span>
          <span className="text-base font-semibold">Vitalock</span>
        </div>
        <ThemeToggle />
      </header>
      <div className="min-h-0 flex-1">
        <Outlet />
      </div>
    </main>
  );
}
