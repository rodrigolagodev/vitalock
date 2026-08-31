import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@vitalock/ui';

export interface Crumb {
  label: string;
  to?: string;
}

interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  breadcrumbs?: Crumb[];
  /** Adornment rendered inline next to the title (e.g. a StatusBadge). */
  titleAdornment?: ReactNode;
  /** Extra classes applied to the title h1 (e.g. font-mono for identifiers). */
  titleClassName?: string;
  children?: ReactNode;
}

export function PageHeader({
  title,
  subtitle,
  breadcrumbs,
  titleAdornment,
  titleClassName,
  children,
}: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-1">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-1.5 text-xs text-muted-foreground"
        >
          {breadcrumbs.map((crumb, index) => (
            <span key={index} className="flex items-center gap-1.5">
              {index > 0 && (
                <ChevronRight aria-hidden="true" className="h-6 w-6 text-muted-foreground" />
              )}
              {crumb.to ? (
                <Link to={crumb.to} className="transition-colors hover:text-foreground">
                  {crumb.label}
                </Link>
              ) : (
                <span>{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <h1
              className={cn(
                'text-2xl font-semibold text-foreground',
                titleClassName,
              )}
            >
              {title}
            </h1>
            {titleAdornment}
          </div>
          {subtitle != null && (
            <div className="text-sm text-muted-foreground">{subtitle}</div>
          )}
        </div>
        {children != null && (
          <div className="flex shrink-0 items-center gap-2">{children}</div>
        )}
      </div>
    </div>
  );
}
