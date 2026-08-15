import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export interface Crumb {
  label: string;
  to?: string;
}

interface PageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  breadcrumbs?: Crumb[];
  children?: ReactNode;
}

export function PageHeader({ title, subtitle, breadcrumbs, children }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-1">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-1.5 text-[14px] text-[#4d515a]"
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
          <h1 className="text-2xl font-semibold text-[#1e293b]">{title}</h1>
          {subtitle != null && (
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {children != null && (
          <div className="flex shrink-0 items-center gap-2">{children}</div>
        )}
      </div>
    </div>
  );
}
