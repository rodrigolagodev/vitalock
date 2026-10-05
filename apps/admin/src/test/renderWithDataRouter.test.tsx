import { describe, it, expect } from 'vitest';
import { act, screen } from '@testing-library/react';
import { renderWithDataRouter } from './renderWithDataRouter';

describe('renderWithDataRouter', () => {
  it('mounts the ui at the given path and exposes the router', () => {
    const { router } = renderWithDataRouter(<p>formulario</p>, {
      path: '/nueva',
      initialEntries: ['/nueva'],
    });
    expect(screen.getByText('formulario')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/nueva');
  });

  it('renders extra routes after navigating', async () => {
    const { router } = renderWithDataRouter(<p>origen</p>, {
      routes: [{ path: '/otra', element: <p>destino</p> }],
    });
    await act(() => router.navigate('/otra'));
    expect(screen.getByText('destino')).toBeInTheDocument();
  });
});
