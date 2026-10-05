import type { ReactNode } from 'react';

export interface SectionHeadingProps {
  title: string;
  description?: string;
  /** Optional action slot rendered on the right of the heading. */
  children?: ReactNode;
}

export function SectionHeading({ title, description, children }: SectionHeadingProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-title-3">{title}</h2>
        {description ? (
          <p className="text-callout text-muted-foreground mt-1">{description}</p>
        ) : null}
      </div>
      {children ? <div className="shrink-0">{children}</div> : null}
    </div>
  );
}
