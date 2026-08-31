import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NavItem } from '../NavItem';

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
