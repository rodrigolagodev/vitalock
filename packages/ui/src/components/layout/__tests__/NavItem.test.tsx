import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NavItem } from '@vitalock/ui';

function renderNavItem(props: { collapsed?: boolean; badge?: number }) {
  return render(
    <MemoryRouter initialEntries={['/ordenes']}>
      <NavItem
        label="Órdenes"
        to="/ordenes"
        icon={<span aria-hidden="true">🔑</span>}
        badge={props.badge}
        collapsed={props.collapsed}
      />
    </MemoryRouter>,
  );
}

describe('NavItem', () => {
  it('shows label and badge when expanded', () => {
    renderNavItem({ badge: 3 });
    const link = screen.getByRole('link', { name: /Órdenes/ });
    expect(link).toHaveAttribute('href', '/ordenes');
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('hides label and badge from AT when collapsed but keeps the icon as a link', () => {
    renderNavItem({ collapsed: true, badge: 3 });
    // Label and badge stay in the DOM to keep layout stable during the sidebar
    // collapse animation, but are aria-hidden and visually opacity-0 so screen
    // readers ignore them and users see icon-only.
    const label = screen.getByText('Órdenes');
    expect(label).toHaveAttribute('aria-hidden', 'true');
    expect(label.className).toContain('opacity-0');
    const badge = screen.getByText('3');
    expect(badge).toHaveAttribute('aria-hidden', 'true');
    expect(badge.className).toContain('opacity-0');
    // The link keeps its accessible name via aria-label.
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/ordenes');
    expect(link).toHaveAttribute('aria-label', 'Órdenes');
  });
});

describe('NavItem active state', () => {
  function renderAt(
    pathname: string,
    props: { to: string; end?: boolean; excludeSubpaths?: string[] },
  ) {
    return render(
      <MemoryRouter initialEntries={[pathname]}>
        <NavItem label="Item" {...props} />
      </MemoryRouter>,
    );
  }

  it('is active on a subpath by default (prefix match)', () => {
    renderAt('/ordenes/42', { to: '/ordenes' });
    expect(screen.getByRole('link').className).toContain('bg-primary');
  });

  it('is not active on a subpath when `end` is set', () => {
    renderAt('/ordenes/42', { to: '/ordenes', end: true });
    expect(screen.getByRole('link').className).not.toContain('bg-primary');
  });

  it('is active on the exact path when `end` is set', () => {
    renderAt('/', { to: '/', end: true });
    expect(screen.getByRole('link').className).toContain('bg-primary');
  });

  it('is not active on an excluded subpath', () => {
    renderAt('/llaves/inventario', { to: '/llaves', excludeSubpaths: ['/llaves/inventario'] });
    expect(screen.getByRole('link').className).not.toContain('bg-primary');
  });
});
