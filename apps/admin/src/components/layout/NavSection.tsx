import type { ReactNode } from 'react';
import { cn } from '@vitalock/ui';
import { Badge } from '@/components/ui/badge';

interface NavSectionProps {
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  children?: ReactNode;
}

export function NavSection({ label, icon, disabled = false, children }: NavSectionProps) {
  if (disabled) {
    return (
      <div className="space-y-1">
        <div
          className={cn(
            'flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground opacity-60 cursor-default select-none',
          )}
        >
          {icon && <span className="shrink-0">{icon}</span>}
          <span>{label}</span>
          <Badge variant="secondary" className="ml-auto text-xs">
            Próximamente
          </Badge>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <p className="flex items-center gap-2 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {icon && <span className="shrink-0">{icon}</span>}
        {label}
      </p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}
