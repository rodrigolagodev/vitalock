import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

export interface SidebarGroupProps {
  /** Section label rendered above the group's items. */
  label: string;
  /** Nav items rendered below the label. Optional — placeholder sections can be label-only. */
  children?: ReactNode;
  /** When true, swaps the section label for a subtle divider in the same fixed-height slot, so nav items below never shift vertically during sidebar collapse. */
  collapsed?: boolean;
  className?: string;
}

/**
 * Non-interactive sidebar section: an uppercase label above nav items.
 * The header slot has a constant height in both states; expanded shows the
 * label, collapsed shows a subtle divider. This keeps nav item vertical
 * positions stable across the sidebar collapse animation.
 */
export function SidebarGroup({
  label,
  children,
  collapsed = false,
  className,
}: SidebarGroupProps) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="relative flex h-9 items-center px-3">
        <p
          className={cn(
            'whitespace-nowrap text-xs font-medium uppercase tracking-wide text-muted-foreground transition-opacity duration-200',
            collapsed && 'opacity-0',
          )}
          aria-hidden={collapsed}
        >
          {label}
        </p>
        <span
          className={cn(
            'pointer-events-none absolute inset-x-3 top-1/2 h-px -translate-y-1/2 bg-border transition-opacity duration-200',
            !collapsed && 'opacity-0',
          )}
          aria-hidden="true"
        />
      </div>
      {children}
    </div>
  );
}
