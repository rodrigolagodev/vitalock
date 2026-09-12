import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { AppShell } from '@vitalock/ui';

const logo = { lightSrc: '/logo-black.svg', darkSrc: '/logo-white.svg', alt: 'Acme' };

describe('AppShell', () => {
  it('renders the mobile topbar with the drawer slot and both brand logos', () => {
    render(
      <MemoryRouter>
        <AppShell
          logo={logo}
          sidebar={<aside data-testid="sidebar">sidebar</aside>}
          mobileSidebar={<button type="button">menu</button>}
        >
          <p>content</p>
        </AppShell>
      </MemoryRouter>,
    );
    const header = screen.getByRole('banner');
    expect(header).toContainElement(screen.getByRole('button', { name: 'menu' }));
    expect(header.querySelectorAll('img')).toHaveLength(2);
    expect(screen.getByAltText('Acme')).toHaveAttribute('src', '/logo-black.svg');
    expect(header.querySelector('img[src="/logo-white.svg"]')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveTextContent('content');
  });

  it('renders the router Outlet when no children are given', () => {
    render(
      <MemoryRouter initialEntries={['/x']}>
        <Routes>
          <Route element={<AppShell logo={logo} sidebar={null} />}>
            <Route path="/x" element={<p>routed page</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole('main')).toHaveTextContent('routed page');
  });

  it('merges mainClassName into the main container', () => {
    render(
      <MemoryRouter>
        <AppShell logo={logo} sidebar={null} mainClassName="pb-20">
          <p>content</p>
        </AppShell>
      </MemoryRouter>,
    );
    expect(screen.getByRole('main').className).toContain('pb-20');
    expect(screen.getByRole('main').className).toContain('bg-content');
  });
});
