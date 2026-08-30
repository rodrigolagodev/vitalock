import type { ReactNode } from 'react';

interface SectionProps {
  title: string;
  children?: ReactNode;
}

export function Section({ title, children }: SectionProps) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}