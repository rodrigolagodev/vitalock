export const DEFAULT_PAGE_SIZE = 10;

export const ROWS_PER_PAGE_OPTIONS = [10, 20, 50] as const;

export function getPageSlice<T>(rows: T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize;
  return rows.slice(start, start + pageSize);
}
