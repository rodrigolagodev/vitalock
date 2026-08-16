import * as React from 'react';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';

import { cn } from '../../lib/utils';
import { Button } from '../button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../table';
import { DEFAULT_PAGE_SIZE, getPageSlice } from './pagination';
import { PaginationFooter } from './PaginationFooter';

export interface DataTableColumn<T> {
  header: string;
  cell: (row: T) => React.ReactNode;
  className?: string;
  headerClassName?: string;
}

export interface DataTableAction<T> {
  icon: LucideIcon;
  /** Spanish aria-label, verb-first ("Editar a {nombre}"). */
  label: string | ((row: T) => string);
  onClick: (row: T) => void;
  show?: (row: T) => boolean;
  disabled?: (row: T) => boolean;
  /** Disables the button and pulses the icon while true. */
  loading?: (row: T) => boolean;
  className?: string | ((row: T) => string);
}

export interface DataTableProps<T> {
  rows: T[];
  isFetching?: boolean;
  columns: DataTableColumn<T>[];
  rowKey: (row: T) => string;
  firstCell?: 'link' | 'button' | 'text';
  getRowHref?: (row: T) => string;
  onFirstCellClick?: (row: T) => void;
  actions?: DataTableAction<T>[];
  renderActions?: (row: T) => React.ReactNode;
  actionsHeaderLabel?: string;
  emptyMessage?: string;
  filteredEmptyMessage?: string;
  hasFilters?: boolean;
  paginated?: boolean;
}

const SKELETON_ROWS = 3;

export function DataTable<T>({
  rows,
  isFetching = false,
  columns,
  rowKey,
  firstCell = 'text',
  getRowHref,
  onFirstCellClick,
  actions,
  renderActions,
  actionsHeaderLabel = 'Acciones',
  emptyMessage,
  filteredEmptyMessage,
  hasFilters = false,
  paginated = true,
}: DataTableProps<T>) {
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(DEFAULT_PAGE_SIZE);

  // Reset pagination when the underlying row set changes (filter/search).
  React.useEffect(() => {
    setPage(1);
    setPageSize(DEFAULT_PAGE_SIZE);
  }, [rows]);

  const hasActions = Boolean(actions) || Boolean(renderActions);
  const visibleRows = paginated ? getPageSlice(rows, page, pageSize) : rows;
  const columnCount = columns.length + (hasActions ? 1 : 0);
  const [firstColumn, ...restColumns] = columns;

  const renderFirstCell = (row: T) => {
    if (!firstColumn) return null;
    const content = firstColumn.cell(row);
    if (firstCell === 'link' && getRowHref) {
      return (
        <Link
          to={getRowHref(row)}
          className="font-medium text-foreground hover:underline"
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
          className="font-medium text-foreground hover:underline"
        >
          {content}
        </button>
      );
    }
    return <span className="font-medium">{content}</span>;
  };

  const renderActionsCell = (row: T) => {
    if (renderActions) {
      return renderActions(row);
    }
    const rowActions = (actions ?? []).filter((action) => action.show?.(row) !== false);
    return (
      <div className="flex items-center justify-end gap-1">
        {rowActions.map((action, index) => {
          const label = typeof action.label === 'function' ? action.label(row) : action.label;
          const isDisabled = action.disabled?.(row) ?? false;
          const isLoading = action.loading?.(row) ?? false;
          const Icon = action.icon;
          const className =
            typeof action.className === 'function' ? action.className(row) : action.className;
          return (
            <Button
              key={index}
              type="button"
              variant="ghost"
              size="icon"
              aria-label={label}
              disabled={isDisabled || isLoading}
              onClick={() => action.onClick(row)}
              className={className}
            >
              <Icon className={cn('h-4 w-4', isLoading && 'animate-pulse')} />
            </Button>
          );
        })}
      </div>
    );
  };

  return (
    <div className="overflow-hidden rounded-[12px] border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {columns.map((column, index) => (
              <TableHead key={index} className={column.headerClassName}>
                {column.header}
              </TableHead>
            ))}
            {hasActions && <TableHead className="text-right">{actionsHeaderLabel}</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {isFetching ? (
            Array.from({ length: SKELETON_ROWS }, (_, rowIndex) => (
              <TableRow key={rowIndex}>
                {Array.from({ length: columnCount }, (_, cellIndex) => (
                  <TableCell key={cellIndex}>
                    <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columnCount}>
                <div className="flex justify-center rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                  {hasFilters ? (filteredEmptyMessage ?? emptyMessage) : emptyMessage}
                </div>
              </TableCell>
            </TableRow>
          ) : (
            visibleRows.map((row) => (
              <TableRow key={rowKey(row)}>
                <TableCell>{renderFirstCell(row)}</TableCell>
                {restColumns.map((column, index) => (
                  <TableCell key={index} className={column.className}>
                    {column.cell(row)}
                  </TableCell>
                ))}
                {hasActions && <TableCell className="text-right">{renderActionsCell(row)}</TableCell>}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
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
