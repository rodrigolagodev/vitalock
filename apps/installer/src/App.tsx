import { Outlet } from 'react-router-dom';
import { ThemeToggle } from '@/components/common/ThemeToggle';

export default function App() {
  return (
    <main className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex h-14 shrink-0 items-center justify-between border-b bg-background px-4">
        <span className="text-sm font-semibold">Vitalock Instalador</span>
        <ThemeToggle />
      </header>
      <div className="min-h-0 flex-1">
        <Outlet />
      </div>
    </main>
  );
}
