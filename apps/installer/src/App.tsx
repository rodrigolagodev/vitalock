import { Outlet } from 'react-router-dom';
import { ThemeToggle } from '@/components/common/ThemeToggle';

export default function App() {
  return (
    <main className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex h-14 shrink-0 items-center justify-between border-b bg-card px-4">
        <div className="flex items-center gap-2.5">
          <img
            src={`${import.meta.env.BASE_URL}Vitalock_logo_vector_black.svg`}
            alt="Vitalock"
            className="block h-8 w-auto dark:hidden"
          />
          <img
            src={`${import.meta.env.BASE_URL}Vitalock_logo_vector_white.svg`}
            alt=""
            aria-hidden="true"
            className="hidden h-8 w-auto dark:block"
          />
        </div>
        <ThemeToggle />
      </header>
      <div className="min-h-0 flex-1">
        <Outlet />
      </div>
    </main>
  );
}
