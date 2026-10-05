import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

export interface StatCardProps {
  label: string;
  value: number | string | null | undefined;
  icon?: ReactNode;
  className?: string;
}

export function StatCard({ label, value, icon, className }: StatCardProps) {
  return (
    <div
      className={cn(
        'rounded-container bg-card flex w-full items-center gap-4 border p-4',
        className,
      )}
    >
      {icon ? (
        <div className="rounded-control bg-primary/10 text-primary flex h-10 w-10 shrink-0 items-center justify-center">
          {icon}
        </div>
      ) : null}
      <div>
        <p className="text-callout text-muted-foreground">{label}</p>
        <p className="text-title-2 mt-0.5 tabular-nums">{value ?? '—'}</p>
      </div>
    </div>
  );
}
