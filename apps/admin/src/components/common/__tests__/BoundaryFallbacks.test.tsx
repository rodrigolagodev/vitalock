import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';

const { reportErrorMock } = vi.hoisted(() => ({ reportErrorMock: vi.fn() }));

vi.mock('@vitalock/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@vitalock/shared')>();
  return { ...actual, reportError: reportErrorMock };
});

import { RouteErrorFallback } from '../BoundaryFallbacks';

function Boom({ thrown }: { thrown: unknown }): never {
  throw thrown;
}

function renderBroken(thrown: unknown) {
  const router = createMemoryRouter([
    {
      path: '/',
      element: <Boom thrown={thrown} />,
      errorElement: <RouteErrorFallback />,
    },
  ]);
  return render(<RouterProvider router={router} />);
}

describe('RouteErrorFallback', () => {
  beforeEach(() => {
    reportErrorMock.mockClear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('reports an Error thrown by a route once and renders the root fallback copy', () => {
    const error = new Error('boom');
    renderBroken(error);
    expect(reportErrorMock).toHaveBeenCalledTimes(1);
    expect(reportErrorMock).toHaveBeenCalledWith('admin:route', expect.any(String), error);
    expect(screen.getByText('La aplicación encontró un error inesperado.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('normalises a non-Error throw into an Error before reporting', () => {
    renderBroken('cadena');
    expect(reportErrorMock).toHaveBeenCalledTimes(1);
    const reported = reportErrorMock.mock.calls[0]?.[2];
    expect(reported).toBeInstanceOf(Error);
    expect((reported as Error).message).toContain('cadena');
  });

  it('reloads the page as the reset action', async () => {
    const reload = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { reload },
    });
    renderBroken(new Error('boom'));
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
