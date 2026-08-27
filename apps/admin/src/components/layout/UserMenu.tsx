import { ChevronsUpDown, LogOut, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button, Switch } from '@vitalock/ui';
import { useAuthContext } from '@vitalock/shared';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

function initialsFromName(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function UserMenu() {
  const { staff, session, signOut } = useAuthContext();
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

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
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-[13px] font-medium text-muted-foreground">
            {initials}
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium">{name}</span>
            {email && (
              <span className="truncate text-xs text-muted-foreground">
                {email}
              </span>
            )}
          </div>
          <ChevronsUpDown
            className="h-4 w-4 shrink-0 text-muted-foreground"
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
          <div className="flex items-center gap-2 text-sm">
            {isDark ? (
              <Moon className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Sun className="h-4 w-4 text-muted-foreground" />
            )}
            <span>Modo oscuro</span>
          </div>
          <Switch
            checked={isDark}
            onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
            aria-label="Cambiar entre tema claro y oscuro"
          />
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
