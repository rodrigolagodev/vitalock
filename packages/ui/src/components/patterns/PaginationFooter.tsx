import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import { ROWS_PER_PAGE_OPTIONS } from './pagination';

export interface PaginationFooterProps {
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

export function PaginationFooter({
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: PaginationFooterProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const canGoPrev = page > 1;
  const canGoNext = page < pageCount;

  return (
    <div className="flex flex-wrap items-center justify-end gap-4 border-t px-4 py-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Filas por página:</span>
        <div className="relative">
          <select
            aria-label="Filas por página"
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            className="h-10 appearance-none rounded-md border bg-card pl-3 pr-8 text-xs"
          >
            {ROWS_PER_PAGE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2" />
        </div>
        <span>
          {start}–{end} de {total}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Página anterior"
          disabled={!canGoPrev}
          onClick={() => onPageChange(page - 1)}
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-md border',
            'disabled:opacity-40',
          )}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Página siguiente"
          disabled={!canGoNext}
          onClick={() => onPageChange(page + 1)}
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-md border',
            'disabled:opacity-40',
          )}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
