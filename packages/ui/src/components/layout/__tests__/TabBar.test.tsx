import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { History, LayoutDashboard, ListTodo } from 'lucide-react';
import { TabBar, type TabBarItem } from '@vitalock/ui';

const items: TabBarItem[] = [
  { to: '/', label: 'Inicio', icon: LayoutDashboard, end: true },
  { to: '/tareas', label: 'Tareas', icon: ListTodo },
  { to: '/historial', label: 'Historial', icon: History },
];

function renderBar(path = '/', props: Partial<React.ComponentProps<typeof TabBar>> = {}) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <TabBar items={items} {...props} />
    </MemoryRouter>,
  );
}

describe('TabBar', () => {
  it('renders one link per item with its label and href', () => {
    renderBar();
    const nav = screen.getByRole('navigation', { name: 'Principal' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(['Inicio', 'Tareas', 'Historial']);
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/', '/tareas', '/historial']);
  });

  it('marks only the active tab with aria-current and the primary tint', () => {
    renderBar('/tareas');
    const active = screen.getByRole('link', { name: 'Tareas' });
    expect(active).toHaveAttribute('aria-current', 'page');
    expect(active).toHaveClass('text-primary');
    for (const name of ['Inicio', 'Historial']) {
      const link = screen.getByRole('link', { name });
      expect(link).not.toHaveAttribute('aria-current');
      expect(link).not.toHaveClass('text-primary');
    }
  });

  it('keeps the parent tab active on nested routes, and end-only for the root', () => {
    renderBar('/tareas/abc');
    expect(screen.getByRole('link', { name: 'Tareas' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Inicio' })).not.toHaveAttribute('aria-current');
  });

  it('applies the bottom safe-area padding on the nav and a 49px row', () => {
    renderBar();
    const nav = screen.getByRole('navigation', { name: 'Principal' });
    expect(nav).toHaveClass('pb-safe-b');
    expect(nav.firstElementChild).toHaveClass('h-tab-bar');
  });

  it('gives each link a 44px touch floor and a visible focus ring', () => {
    renderBar();
    for (const link of screen.getAllByRole('link')) {
      expect(link).toHaveClass(
        'min-h-control-md',
        'focus-visible:ring-2',
        'focus-visible:ring-ring',
      );
    }
  });

  it('hides icons from assistive tech', () => {
    renderBar();
    const svgs = screen.getByRole('navigation').querySelectorAll('svg');
    expect(svgs).toHaveLength(3);
    for (const svg of svgs) expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  it('accepts a custom accessible label', () => {
    renderBar('/', { 'aria-label': 'Secundaria' });
    expect(screen.getByRole('navigation', { name: 'Secundaria' })).toBeInTheDocument();
  });
});
