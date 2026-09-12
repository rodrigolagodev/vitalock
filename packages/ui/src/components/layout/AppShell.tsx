import type { ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { BrandLogoImages, type BrandLogo } from './BrandLogo';

export interface AppShellProps {
  /** Desktop sidebar (md+), typically a `<Sidebar>` composed by the app. */
  sidebar: ReactNode;
  /** Mobile drawer trigger rendered at the left of the mobile topbar, typically a `<MobileSidebar>`. */
  mobileSidebar?: ReactNode;
  /** Brand logo (light + dark variants) shown in the mobile topbar. */
  logo: BrandLogo;
  /** Extra classes for the `<main>` scroll container. */
  mainClassName?: string;
  /** Page content. Defaults to react-router's `<Outlet />` when omitted. */
  children?: ReactNode;
}

/**
 * Full-height application frame: a mobile-only topbar (hamburger + brand),
 * the desktop sidebar and the scrolling `<main>` content area.
 */
export function AppShell({ sidebar, mobileSidebar, logo, mainClassName, children }: AppShellProps) {
  return (
    <div className="flex h-screen flex-col">
      {/* Mobile-only topbar: hamburger on the left (matches the desktop
          sidebar's spatial model) followed by the brand. Hidden on md+
          where the desktop sidebar carries brand + nav + user menu. */}
      <header className="bg-card flex h-14 shrink-0 items-center gap-2 border-b px-2 md:hidden">
        {mobileSidebar}
        <div className="flex items-center gap-2.5">
          <BrandLogoImages logo={logo} className="h-7" />
        </div>
      </header>

      <div className="flex min-h-0 w-full flex-1">
        {sidebar}
        <main className={cn('bg-content min-w-0 flex-1 overflow-auto px-6 pt-6', mainClassName)}>
          {children ?? <Outlet />}
        </main>
      </div>
    </div>
  );
}
