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
        'flex aspect-[350/176] max-w-[350px] items-center gap-4 rounded-lg border bg-card p-5',
        className,
      )}
    >
      {icon ? (
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </div>
      ) : null}
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-3xl font-semibold">{value ?? '—'}</p>
      </div>
    </div>
  );
}
