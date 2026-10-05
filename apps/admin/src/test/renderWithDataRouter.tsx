import { useState, type ReactElement, type ReactNode } from 'react';
import { render, type RenderResult } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router-dom';

type TestRouter = ReturnType<typeof createMemoryRouter>;

export interface RenderWithDataRouterOptions {
  /** Route path the `ui` is mounted at. Defaults to `/`. */
  path?: string;
  initialEntries?: string[];
  /** Extra sibling routes, e.g. navigation targets. */
  routes?: RouteObject[];
}

/**
 * `useBlocker` only works under a data router, so tests of guarded forms
 * mount the UI in a `createMemoryRouter`. Returns the router so tests can
 * `router.navigate(...)` and read `router.state.location`.
 */
export function renderWithDataRouter(
  ui: ReactElement,
  { path = '/', initialEntries = ['/'], routes = [] }: RenderWithDataRouterOptions = {},
): RenderResult & { router: ReturnType<typeof createMemoryRouter> } {
  const router = createMemoryRouter([{ path, element: ui }, ...routes], { initialEntries });
  const result = render(<RouterProvider router={router} />);
  return { router, ...result };
}

/**
 * For files that already render through RTL's `wrapper` option: returns a
 * wrapper that mounts the children inside a memory data router, plus a getter
 * for the router of the latest mount.
 */
export function makeDataRouterWrapper({
  path = '/',
  initialEntries = ['/'],
  routes = [],
  wrap = (children: ReactNode) => children,
}: RenderWithDataRouterOptions & { wrap?: (children: ReactNode) => ReactNode } = {}): {
  Wrapper: (props: { children: ReactNode }) => ReactElement;
  getRouter: () => TestRouter;
} {
  let latest: TestRouter | null = null;
  function Wrapper({ children }: { children: ReactNode }) {
    const [router] = useState(() => {
      latest = createMemoryRouter([{ path, element: wrap(children) }, ...routes], {
        initialEntries,
      });
      return latest;
    });
    return <RouterProvider router={router} />;
  }
  return {
    Wrapper,
    getRouter: () => {
      if (!latest) throw new Error('makeDataRouterWrapper: nothing has been rendered yet');
      return latest;
    },
  };
}
