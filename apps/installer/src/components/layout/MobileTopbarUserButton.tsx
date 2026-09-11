import { LogOut, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button, Popover, PopoverContent, PopoverTrigger, Switch } from '@vitalock/ui';
import { useAuthContext } from '@vitalock/shared';

function initialsFromName(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/**
 * Mobile-only avatar button that opens a compact user popover with theme
 * toggle and sign-out. Sits at the right of the topbar and mirrors the
 * desktop sidebar's `UserMenu` at the bottom — both surfaces expose the
 * same profile controls in the "corner" position expected by the app.
 */
export function MobileTopbarUserButton() {
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
          className="bg-muted text-muted-foreground hover:bg-muted/80 focus-visible:ring-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2"
          aria-label="Abrir menú de usuario"
        >
          {initials}
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" sideOffset={8} className="w-[248px] p-0">
        <div className="flex flex-col gap-0.5 border-b px-3 py-3">
          <span className="truncate text-sm font-medium">{name}</span>
          {email && <span className="text-muted-foreground truncate text-xs">{email}</span>}
        </div>
        <div className="flex items-center justify-between px-3 py-2.5">
          <div className="flex items-center gap-2 text-sm">
            {isDark ? (
              <Moon className="text-muted-foreground h-4 w-4" />
            ) : (
              <Sun className="text-muted-foreground h-4 w-4" />
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
