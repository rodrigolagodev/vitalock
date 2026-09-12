import type { ReactNode } from 'react';
import { Building2, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import { BrandLogoImages, type BrandLogo } from './BrandLogo';

export interface SidebarNavProps {
  /**
   * Brand logo (light + dark variants) rendered in the expanded header.
   * Apps compute the URLs (e.g. from `import.meta.env.BASE_URL`); the
   * library never reads env. Only required while `showLogo` is true.
   */
  logo?: BrandLogo;
  /** Icon mark rendered in the collapsed header instead of the logo. Defaults to a Building2 mark. */
  brandMark?: ReactNode;
  /**
   * Whether to render the brand logo header. Desktop sidebar shows it;
   * the mobile drawer hides it because the mobile topbar already carries
   * the brand — avoids showing the logo twice.
   */
  showLogo?: boolean;
  /** When true, renders icon-only (64px) with tooltips; labels hidden. */
  collapsed?: boolean;
  /** Called when the collapse toggle button is activated. */
  onToggle?: () => void;
  /** Nav content: the app's `<SidebarGroup>` / `<NavItem>` tree. */
  children: ReactNode;
  /** Rendered pinned to the bottom, above the collapse toggle (e.g. a `<UserMenu>`). */
  footer?: ReactNode;
}

export interface SidebarProps extends Omit<SidebarNavProps, 'showLogo' | 'logo'> {
  /** Brand logo (light + dark variants) rendered in the expanded header. */
  logo: BrandLogo;
  className?: string;
}

/** Small icon mark shown in the collapsed brand header in place of the logo. */
export function BrandMark() {
  return (
    <span
      aria-hidden="true"
      className="bg-primary text-primary-foreground flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
    >
      <Building2 className="h-4 w-4" />
    </span>
  );
}

/**
 * Full sidebar content — logo + nav slot + footer slot pinned to the
 * bottom above the collapse toggle. Shared between the desktop `Sidebar`
 * (visible on md+) and the mobile `MobileSidebar` drawer.
 *
 * Layout invariant: nothing in the DOM structure changes between collapsed
 * and expanded; only the aside width animates, so icons never move.
 */
export function SidebarNav({
  logo,
  brandMark,
  showLogo = true,
  collapsed = false,
  onToggle,
  children,
  footer,
}: SidebarNavProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      {showLogo && logo && (
        <div
          className={cn(
            'flex shrink-0 items-center gap-2.5 py-4',
            collapsed ? 'justify-center px-0' : 'px-6',
          )}
        >
          {collapsed ? (
            (brandMark ?? <BrandMark />)
          ) : (
            <BrandLogoImages logo={logo} className="h-8" />
          )}
        </div>
      )}

      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden px-2 pb-4 pt-4">
        {children}
      </nav>

      <div className="shrink-0 border-t">
        {footer}
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={collapsed}
          aria-label="Toggle sidebar"
          className="text-muted-foreground hover:bg-muted focus-visible:bg-muted flex h-11 w-full items-center justify-center border-t transition-colors focus-visible:outline-none"
        >
          {collapsed ? (
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          ) : (
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          )}
        </button>
      </div>
    </div>
  );
}

/**
 * Desktop sidebar (md+): a 240px column that animates to 64px when
 * collapsed. Hidden below md, where `MobileSidebar` takes over.
 */
export function Sidebar({
  className,
  collapsed = false,
  onToggle,
  logo,
  brandMark,
  children,
  footer,
}: SidebarProps) {
  // aria-expanded on the sidebar is required by the admin-shell spec. The
  // jsx-a11y `role-supports-aria-props` rule (active in the apps, not in this
  // package) flags it because <aside> maps to role complementary; the
  // disclosure semantics are nevertheless required by the design system.
  return (
    <aside
      aria-expanded={!collapsed}
      className={cn(
        'bg-card hidden shrink-0 flex-col overflow-hidden border-r transition-[width] duration-300 ease-in-out motion-reduce:transition-none md:flex',
        collapsed ? 'w-[64px]' : 'w-[240px]',
        className,
      )}
    >
      <SidebarNav
        logo={logo}
        brandMark={brandMark}
        collapsed={collapsed}
        onToggle={onToggle}
        footer={footer}
      >
        {children}
      </SidebarNav>
    </aside>
  );
}
