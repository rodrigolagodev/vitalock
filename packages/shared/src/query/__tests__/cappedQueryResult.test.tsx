import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { toCappedQueryResult } from '../cappedQueryResult';
import type { CappedList } from '../../db/listCap';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('toCappedQueryResult', () => {
  it('exposes rows as data plus total/truncated alongside it', async () => {
    const payload: CappedList<string> = { rows: ['a', 'b'], total: 7, truncated: true };
    const { result } = renderHook(
      () => toCappedQueryResult(useQuery({ queryKey: ['capped'], queryFn: async () => payload })),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(['a', 'b']);
    expect(result.current.total).toBe(7);
    expect(result.current.truncated).toBe(true);

    const refetched = await result.current.refetch();
    expect(refetched.data).toEqual(['a', 'b']);
    expect(refetched.total).toBe(7);
  });

  it('reports not truncated and no total before data loads', () => {
    const { result } = renderHook(
      () =>
        toCappedQueryResult(
          useQuery({
            queryKey: ['pending'],
            queryFn: () => new Promise<CappedList<string>>(() => {}),
          }),
        ),
      { wrapper },
    );
    expect(result.current.data).toBeUndefined();
    expect(result.current.total).toBeUndefined();
    expect(result.current.truncated).toBe(false);
  });
});
