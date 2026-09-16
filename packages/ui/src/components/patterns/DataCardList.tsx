import * as React from 'react';
import { Link } from 'react-router-dom';
import { MoreVertical } from 'lucide-react';

import { cn } from '../../lib/utils';
import { Button } from '../button';
import { Card, CardAction, CardContent, CardFooter, CardHeader, CardTitle } from '../card';
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from '../popover';
import { SectionHeading } from './SectionHeading';
import { DEFAULT_PAGE_SIZE, getPageSlice } from './pagination';
import { PaginationFooter } from './PaginationFooter';
import type { DataTableAction, DataTableColumn } from './DataTable';

/**
 * Coarse density presets — no JS breakpoint listener, resize is pure CSS.
 * `18rem` (288px) is load-bearing: a 360px viewport minus page padding
 * leaves ~328px, so `compact` collapses to exactly 1 column with zero
 * horizontal scroll. `22rem` would not. `auto-fit` (not `auto-fill`)
 * collapses empty tracks so a short list fills the width instead of
 * leaving cards beside dead space.
 *
 * `compact`/`comfortable` tracks end in `1fr` on purpose: whatever number
 * of columns fits at the minimum width, each one then grows to fill the
 * row evenly (fluid, no dead gutter) — 2, 3, 4+ per row all fill the full
 * row width. `full` is the one preset with no per-track upper bound of
 * its own (a single column spans the whole container at any width), so
 * `FULL_CARD_MAX_WIDTH` below caps just that case to avoid one giant
 * full-bleed card.
 */
export type CardListDensity = 'compact' | 'comfortable' | 'full';

// Static class lookup so Tailwind's JIT scans the literals, mirroring
// DataTable's HIDE_BELOW_CLASS pattern.
const GRID_CLASS: Record<CardListDensity, string> = {
  compact: 'grid-cols-[repeat(auto-fit,minmax(18rem,1fr))]',
  comfortable: 'grid-cols-[repeat(auto-fit,minmax(22rem,1fr))]',
  full: 'grid-cols-1',
};

const FULL_CARD_MAX_WIDTH = 'max-w-xl';

const SKELETON_CARDS = 3;

export interface DataCardListProps<T> {
  rows: T[];
  isFetching?: boolean;
  columns: DataTableColumn<T>[];
  rowKey: (row: T) => string;
  firstCell?: 'link' | 'button' | 'text';
  getRowHref?: (row: T) => string;
  onFirstCellClick?: (row: T) => void;
  actions?: DataTableAction<T>[];
  renderActions?: (row: T) => React.ReactNode;
  emptyMessage?: string;
  filteredEmptyMessage?: string;
  hasFilters?: boolean;
  paginated?: boolean;
  /** Grid density preset. @default 'comfortable' */
  density?: CardListDensity;
  /** Groups rows into `SectionHeading` sections; applied after pagination. */
  groupBy?: (row: T) => string;
  /**
   * Renders the heading text for a `groupBy` key. Defaults to the raw key.
   * Returns `string`, not `ReactNode` — `SectionHeading`'s `title` prop
   * requires a string.
   */
  groupLabel?: (key: string) => string;
}

function groupRowsBy<T>(rows: T[], groupBy: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const key = groupBy(row);
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  }
  return map;
}

function splitActions<T>(
  actions: DataTableAction<T>[] | undefined,
  row: T,
): { primary: DataTableAction<T>[]; overflow: DataTableAction<T>[] } {
  const visible = (actions ?? []).filter((action) => action.show?.(row) !== false);
  const explicitPrimary = visible.some((action) => action.primary);
  if (explicitPrimary) {
    return {
      primary: visible.filter((action) => action.primary),
      overflow: visible.filter((action) => !action.primary),
    };
  }
  // Default when nobody sets `primary`: <=2 visible actions are all
  // primary, otherwise only the first is.
  if (visible.length <= 2) {
    return { primary: visible, overflow: [] };
  }
  return { primary: visible.slice(0, 1), overflow: visible.slice(1) };
}

/**
 * Peer renderer to `DataTable` over the exact same `DataTableColumn`/
 * `DataTableAction` metadata — a responsive CSS Grid of `Card`s instead of
 * a `<table>`. See design Decision 1 (slot inference), 3 (grid mechanics),
 * 4 (status/actions), 5 (row navigation), 6 (day grouping) and 7
 * (pagination/loading/empty parity with `DataTable`).
 *
 * Slots: `title` (card header, stretched link), `status` (card header,
 * right-aligned action area), `meta` (card content rows), `hidden` (never
 * rendered), and `icon` (card header, top-left of the title — a decorative,
 * `aria-hidden` glyph so the card's category/type is scannable before
 * reading the title text; never inferred, must be set explicitly).
 *
 * IMPORTANT — no nested interactive elements without `z-10`: the card
 * title renders a stretched link (`after:absolute after:inset-0`) that
 * overlays the entire card, and `CardFooter` already counters it with
 * `relative z-10` so primary/overflow action buttons stay clickable. Any
 * future interactive element added to `CardContent`/meta rows (a link,
 * button, checkbox, etc.) MUST get the same `relative z-10` treatment, or
 * the stretched-link overlay will silently swallow its clicks.
 */
export function DataCardList<T>({
  rows,
  isFetching = false,
  columns,
  rowKey,
  firstCell = 'text',
  getRowHref,
  onFirstCellClick,
  actions,
  renderActions,
  emptyMessage,
  filteredEmptyMessage,
  hasFilters = false,
  paginated = true,
  density = 'comfortable',
  groupBy,
  groupLabel,
}: DataCardListProps<T>) {
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(DEFAULT_PAGE_SIZE);

  // Reset pagination when the underlying row set changes (filter/search) —
  // same behavior as DataTable.
  React.useEffect(() => {
    setPage(1);
    setPageSize(DEFAULT_PAGE_SIZE);
  }, [rows]);

  const slots = columns.map((column, index) => ({
    column,
    slot: column.card ?? (index === 0 ? ('title' as const) : ('meta' as const)),
  }));
  const titleColumn = slots.find((entry) => entry.slot === 'title')?.column;
  const statusColumn = slots.find((entry) => entry.slot === 'status')?.column;
  const iconColumn = slots.find((entry) => entry.slot === 'icon')?.column;
  const metaColumns = slots.filter((entry) => entry.slot === 'meta').map((entry) => entry.column);

  const hasNav =
    (firstCell === 'link' && Boolean(getRowHref)) ||
    (firstCell === 'button' && Boolean(onFirstCellClick));

  const visibleRows = paginated ? getPageSlice(rows, page, pageSize) : rows;
  const gridClassName = cn('grid gap-4', GRID_CLASS[density]);

  const renderTitle = (row: T) => {
    const content = titleColumn?.cell(row) ?? null;
    if (firstCell === 'link' && getRowHref) {
      return (
        <Link
          to={getRowHref(row)}
          className="text-primary truncate font-medium after:absolute after:inset-0 hover:underline"
        >
          {content}
        </Link>
      );
    }
    if (firstCell === 'button' && onFirstCellClick) {
      return (
        <button
          type="button"
          onClick={() => onFirstCellClick(row)}
          className="text-primary truncate text-left font-medium after:absolute after:inset-0 hover:underline"
        >
          {content}
        </button>
      );
    }
    return <span className="truncate font-medium">{content}</span>;
  };

  const renderCard = (row: T) => {
    const { primary, overflow } = splitActions(actions, row);
    // `renderActions` may itself conditionally render nothing for a given
    // row (e.g. no action applies to this row's state) — call it once and
    // reuse the result so an empty return doesn't still leave a blank
    // CardFooter, and so it isn't invoked twice per row.
    const customActions = renderActions?.(row);
    const hasFooter = Boolean(customActions) || primary.length > 0 || overflow.length > 0;
    const titleContent = titleColumn?.cell(row);
    const primaryFieldValue = typeof titleContent === 'string' ? titleContent : rowKey(row);

    return (
      <li key={rowKey(row)} role="listitem">
        <Card
          variant={hasNav ? 'interactive' : 'default'}
          className={cn(
            'relative flex h-full w-full flex-col',
            density === 'full' && FULL_CARD_MAX_WIDTH,
          )}
        >
          <CardHeader>
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {iconColumn && <span className="shrink-0">{iconColumn.cell(row)}</span>}
              <CardTitle className="min-w-0 flex-1">{renderTitle(row)}</CardTitle>
            </div>
            {statusColumn && <CardAction>{statusColumn.cell(row)}</CardAction>}
          </CardHeader>
          {metaColumns.length > 0 && (
            <CardContent>
              {metaColumns.map((column, index) => (
                <div
                  key={index}
                  className={cn('flex items-baseline gap-1.5 text-sm', column.className)}
                >
                  <span className="text-muted-foreground font-normal">{column.header}</span>
                  <span className="text-foreground font-semibold">{column.cell(row)}</span>
                </div>
              ))}
            </CardContent>
          )}
          {hasFooter && (
            <CardFooter className="relative z-10">
              {renderActions ? (
                customActions
              ) : (
                <>
                  {primary.map((action, index) => {
                    const label =
                      typeof action.label === 'function' ? action.label(row) : action.label;
                    const isDisabled = action.disabled?.(row) ?? false;
                    const isLoading = action.loading?.(row) ?? false;
                    const className =
                      typeof action.className === 'function'
                        ? action.className(row)
                        : action.className;
                    const Icon = action.icon;
                    return (
                      <Button
                        key={index}
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isDisabled || isLoading}
                        onClick={() => action.onClick(row)}
                        className={className}
                      >
                        <Icon className={cn('h-4 w-4', isLoading && 'animate-pulse')} />
                        {label}
                      </Button>
                    );
                  })}
                  {overflow.length > 0 && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="ml-auto px-2"
                          aria-label={`Más acciones para ${primaryFieldValue}`}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-56 p-1">
                        <div className="flex flex-col">
                          {overflow.map((action, index) => {
                            const label =
                              typeof action.label === 'function' ? action.label(row) : action.label;
                            const isDisabled = action.disabled?.(row) ?? false;
                            const isLoading = action.loading?.(row) ?? false;
                            const Icon = action.icon;
                            return (
                              <PopoverClose asChild key={index}>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  disabled={isDisabled || isLoading}
                                  onClick={() => action.onClick(row)}
                                  className="w-full justify-start gap-2"
                                >
                                  <Icon className={cn('h-4 w-4', isLoading && 'animate-pulse')} />
                                  {label}
                                </Button>
                              </PopoverClose>
                            );
                          })}
                        </div>
                      </PopoverContent>
                    </Popover>
                  )}
                </>
              )}
            </CardFooter>
          )}
        </Card>
      </li>
    );
  };

  if (isFetching) {
    return (
      <ul role="list" className={gridClassName}>
        {Array.from({ length: SKELETON_CARDS }, (_, index) => (
          <li key={index} role="listitem" data-testid="card-skeleton">
            <Card className={cn('w-full', density === 'full' && FULL_CARD_MAX_WIDTH)}>
              <CardHeader>
                <div className="bg-muted h-4 w-32 animate-pulse rounded" />
              </CardHeader>
              <CardContent>
                <div className="bg-muted h-4 w-full animate-pulse rounded" />
                <div className="bg-muted h-4 w-2/3 animate-pulse rounded" />
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="text-muted-foreground flex justify-center rounded-md border border-dashed px-4 py-8 text-center text-sm">
        {hasFilters ? (filteredEmptyMessage ?? emptyMessage) : emptyMessage}
      </div>
    );
  }

  // Pagination applies before grouping (design Decision 7): a group can be
  // partially hidden across pages, matching DataTable's page-then-render
  // contract.
  const groups = groupBy
    ? [...groupRowsBy(visibleRows, groupBy).entries()].sort((a, b) => b[0].localeCompare(a[0]))
    : null;

  return (
    <div className="flex flex-col gap-4">
      {groups ? (
        groups.map(([key, groupRows]) => (
          <section key={key} className="flex flex-col gap-3">
            <SectionHeading title={groupLabel ? groupLabel(key) : key} variant="secondary" />
            <ul role="list" className={gridClassName}>
              {groupRows.map((row) => renderCard(row))}
            </ul>
          </section>
        ))
      ) : (
        <ul role="list" className={gridClassName}>
          {visibleRows.map((row) => renderCard(row))}
        </ul>
      )}
      {paginated && rows.length > 0 && (
        <PaginationFooter
          total={rows.length}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      )}
    </div>
  );
}
