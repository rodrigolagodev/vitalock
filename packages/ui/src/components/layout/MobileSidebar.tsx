import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { Button } from '../button';
import { SidebarNav } from './Sidebar';

export interface MobileSidebarProps {
  /** Nav content: the app's `<SidebarGroup>` / `<NavItem>` tree. */
  children: ReactNode;
  /** Rendered pinned to the bottom of the drawer (e.g. a `<UserMenu>`). */
  footer?: ReactNode;
}

/**
 * Mobile-only navigation: floating trigger + slide-over drawer anchored
 * to the left, matching the desktop sidebar's spatial model. Hidden on md+
 * where the desktop `Sidebar` takes over. Closes itself on every location
 * change so tapping a link dismisses the drawer.
 */
export function MobileSidebar({ children, footer }: MobileSidebarProps) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  // Auto-close on navigation so tapping a link dismisses the drawer.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="md:hidden">
      {!open && (
        <Button
          size="icon"
          onClick={() => setOpen(true)}
          aria-label="Abrir menú"
          className="fixed bottom-6 left-4 z-40 h-14 w-14 rounded-full shadow-lg"
        >
          <Menu className="h-5 w-5" />
        </Button>
      )}

      {open && (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Cerrar menú"
            className="absolute inset-0 cursor-default bg-black/40"
            onClick={() => setOpen(false)}
          />
          <aside className="bg-card absolute inset-y-0 left-0 flex w-[280px] flex-col border-r shadow-xl">
            <div className="flex shrink-0 items-center justify-end p-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setOpen(false)}
                aria-label="Cerrar menú"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="min-h-0 flex-1">
              <SidebarNav showLogo={false} showToggle={false} footer={footer}>
                {children}
              </SidebarNav>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
