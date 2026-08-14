import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

export interface SidebarGroupProps {
  /** Section label rendered above the group's items. */
  label: string;
  /** Nav items rendered below the label. Optional — placeholder sections can be label-only. */
  children?: ReactNode;
  className?: string;
}

/**
 * Non-interactive sidebar section: a plain uppercase label plus its nav items.
 * The label itself is not a click target.
 */
export function SidebarGroup({ label, children, className }: SidebarGroupProps) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <p className="px-3 pb-1 pt-4 text-[13px] font-medium uppercase tracking-wide text-[#7b8190]">
        {label}
      </p>
      {children}
    </div>
  );
}
