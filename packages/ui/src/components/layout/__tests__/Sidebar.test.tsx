import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Home } from 'lucide-react';

// Import through the package entry point — the public contract consumers
// (admin + installer) will rely on.
import { NavItem, Sidebar, SidebarGroup } from '@vitalock/ui';

const logo = { lightSrc: '/logo-black.svg', darkSrc: '/logo-white.svg', alt: 'Acme' };

function renderSidebar(props?: {
  collapsed?: boolean;
  onToggle?: () => void;
  footer?: React.ReactNode;
  brandMark?: React.ReactNode;
}) {
  return render(
    <MemoryRouter initialEntries={['/inicio']}>
      <Sidebar logo={logo} {...props}>
        <SidebarGroup label="General" collapsed={props?.collapsed}>
          <NavItem label="Inicio" to="/inicio" icon={<Home />} collapsed={props?.collapsed} />
        </SidebarGroup>
      </Sidebar>
    </MemoryRouter>,
  );
}

describe('Sidebar', () => {
  it('renders the light logo with the given alt and a decorative dark logo', () => {
    renderSidebar();
    const light = screen.getByAltText('Acme');
    expect(light).toHaveAttribute('src', '/logo-black.svg');
    const dark = document.querySelector('img[src="/logo-white.svg"]');
    expect(dark).toHaveAttribute('aria-hidden', 'true');
    expect(dark).toHaveAttribute('alt', '');
  });

  it('defaults the logo alt to Vitalock', () => {
    render(
      <MemoryRouter>
        <Sidebar logo={{ lightSrc: '/a.svg', darkSrc: '/b.svg' }}>
          <span>nav</span>
        </Sidebar>
      </MemoryRouter>,
    );
    expect(screen.getByAltText('Vitalock')).toBeInTheDocument();
  });

  it('renders the children nav tree inside a nav landmark', () => {
    renderSidebar();
    expect(screen.getByRole('navigation')).toContainElement(
      screen.getByRole('link', { name: 'Inicio' }),
    );
    expect(screen.getByText('General')).toBeInTheDocument();
  });

  it('expands by default with aria-expanded true and a toggle button not pressed', () => {
    renderSidebar();
    expect(screen.getByRole('complementary')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Toggle sidebar' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('collapses with aria-expanded false, a pressed toggle and the brand mark instead of the logo', () => {
    renderSidebar({ collapsed: true });
    expect(screen.getByRole('complementary')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: 'Toggle sidebar' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.queryByAltText('Acme')).not.toBeInTheDocument();
    // Labels stay in the DOM (stable layout) but are hidden from AT.
    expect(screen.getByText('Inicio')).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders a custom brand mark when collapsed', () => {
    renderSidebar({ collapsed: true, brandMark: <span data-testid="mark">M</span> });
    expect(screen.getByTestId('mark')).toBeInTheDocument();
  });

  it('renders the footer slot above the toggle button', () => {
    renderSidebar({ footer: <div data-testid="footer">footer</div> });
    const footer = screen.getByTestId('footer');
    const toggle = screen.getByRole('button', { name: 'Toggle sidebar' });
    expect(footer.compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('calls onToggle when the toggle button is clicked', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    renderSidebar({ onToggle });
    await user.click(screen.getByRole('button', { name: 'Toggle sidebar' }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
