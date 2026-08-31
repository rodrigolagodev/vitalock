import { ChevronsUpDown, LogOut } from 'lucide-react';
import { Button, cn } from '@vitalock/ui';
import { useAuthContext } from '@vitalock/shared';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@vitalock/ui';
import { ThemeToggle } from './ThemeToggle';

function initialsFromName(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function UserMenu({ collapsed = false }: { collapsed?: boolean }) {
  const { staff, session, signOut } = useAuthContext();

  const name = staff?.full_name ?? 'Usuario';
  const email = session?.user?.email ?? '';
  const initials = initialsFromName(name) || 'US';

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:bg-muted"
          aria-label="Abrir menú de usuario"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
            {initials}
          </span>
          <div
            className={cn(
              'flex min-w-0 flex-1 flex-col transition-opacity duration-200',
              collapsed && 'opacity-0',
            )}
            aria-hidden={collapsed}
          >
            <span className="truncate text-sm font-medium">{name}</span>
            {email && (
              <span className="truncate text-xs text-muted-foreground">
                {email}
              </span>
            )}
          </div>
          <ChevronsUpDown
            className={cn(
              'h-4 w-4 shrink-0 text-muted-foreground transition-opacity duration-200',
              collapsed && 'opacity-0',
            )}
            aria-hidden="true"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        className="w-[248px] p-0"
      >
        <div className="flex flex-col gap-0.5 border-b px-3 py-3">
          <span className="truncate text-sm font-medium">{name}</span>
          {email && (
            <span className="truncate text-xs text-muted-foreground">
              {email}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between px-3 py-2.5">
          <span className="text-sm">Tema</span>
          <ThemeToggle />
        </div>
        <div className="border-t p-1">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2"
            onClick={() => void signOut()}
          >
            <LogOut className="h-4 w-4" />
            Salir
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
