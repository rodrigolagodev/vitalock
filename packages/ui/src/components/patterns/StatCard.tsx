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
        'flex w-full items-center gap-4 rounded-lg border bg-card p-4',
        className,
      )}
    >
      {icon ? (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </div>
      ) : null}
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-2xl font-semibold">{value ?? '—'}</p>
      </div>
    </div>
  );
}
