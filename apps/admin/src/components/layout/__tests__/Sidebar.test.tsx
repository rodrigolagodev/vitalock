import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from 'next-themes';
import { Sidebar } from '../Sidebar';

const { useAuthContextMock } = vi.hoisted(() => ({
  useAuthContextMock: vi.fn(() => ({
    staff: { full_name: 'Ana Alvarez' },
    session: { user: { email: 'ana@vitalock.com' } },
    signOut: vi.fn(),
  })),
}));

vi.mock('@vitalock/shared', () => ({ useAuthContext: useAuthContextMock }));

function renderSidebar(props?: { collapsed?: boolean; onToggle?: () => void }) {
  return render(
    <ThemeProvider attribute="class">
      <MemoryRouter initialEntries={['/ordenes']}>
        <Sidebar collapsed={props?.collapsed} onToggle={props?.onToggle} />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe('Sidebar', () => {
  it('renders the brand logo above the navigation', () => {
    renderSidebar();
    expect(screen.getByAltText('Vitalock')).toBeInTheDocument();
  });

  it('keeps every routed item a live navigation link', () => {
    renderSidebar();
    const expected = [
      ['Administraciones', '/administraciones'],
      ['Particulares', '/particulares'],
      ['Órdenes de llaves', '/llaves'],
      ['Servicio técnico', '/servicio-tecnico'],
      ['Órdenes', '/ordenes'],
      ['Tareas', '/tareas'],
      ['Personal', '/personal'],
      ['Stock', '/stock'],
    ] as const;
    for (const [label, href] of expected) {
      expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', href);
    }
  });

  it('renders both inventory links (llaves + equipos) under distinct hrefs', () => {
    renderSidebar();
    const inventarioLinks = screen.getAllByRole('link', { name: 'Inventario' });
    const hrefs = inventarioLinks.map((a) => a.getAttribute('href')).sort();
    expect(hrefs).toEqual(['/equipos', '/llaves/inventario']);
  });

  it('does not render a Historial nav link after rename', () => {
    renderSidebar();
    expect(screen.queryByRole('link', { name: 'Historial' })).not.toBeInTheDocument();
  });

  it('groups items under section headers', () => {
    renderSidebar();
    for (const section of ['Clientes', 'Llaves', 'Equipos', 'Operación', 'Equipo interno']) {
      expect(screen.getByText(section)).toBeInTheDocument();
    }
  });

  it('renders Órdenes link pointing to /ordenes', () => {
    renderSidebar();
    expect(screen.getByRole('link', { name: 'Órdenes' })).toHaveAttribute('href', '/ordenes');
  });

  it('expands by default with aria-expanded true and a toggle button not pressed', () => {
    renderSidebar();
    const aside = screen.getByRole('complementary');
    expect(aside).toHaveAttribute('aria-expanded', 'true');
    const toggle = screen.getByRole('button', { name: 'Toggle sidebar' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
  });

  it('collapses with aria-expanded false and a pressed toggle button', () => {
    renderSidebar({ collapsed: true });
    const aside = screen.getByRole('complementary');
    expect(aside).toHaveAttribute('aria-expanded', 'false');
    const toggle = screen.getByRole('button', { name: 'Toggle sidebar' });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
  });

  it('hides nav labels and section labels from AT when collapsed', () => {
    renderSidebar({ collapsed: true });
    // Labels stay in the DOM to keep the sidebar layout stable during the
    // collapse animation (icons must not jump). They are hidden from
    // assistive tech via aria-hidden and visually via opacity-0.
    const sectionLabel = screen.getByText('Clientes');
    expect(sectionLabel).toHaveAttribute('aria-hidden', 'true');
    expect(sectionLabel.className).toContain('opacity-0');

    const adminLink = screen
      .getAllByRole('link')
      .find((a) => a.getAttribute('href') === '/administraciones');
    expect(adminLink).toBeDefined();
    // Link keeps its accessible name via aria-label, so it is still
    // navigable with a screen reader even though the visible span is hidden.
    expect(adminLink).toHaveAttribute('aria-label', 'Administraciones');
  });

  it('calls onToggle when the toggle button is clicked', async () => {
    const onToggle = vi.fn();
    const userEvent = (await import('@testing-library/user-event')).default;
    renderSidebar({ onToggle });
    await userEvent.click(screen.getByRole('button', { name: 'Toggle sidebar' }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('shows tooltip with label content when hovering a collapsed nav icon', async () => {
    const userEvent = (await import('@testing-library/user-event')).default;
    renderSidebar({ collapsed: true });
    // The Administraciones link is wrapped in a tooltip with its label.
    const link = screen
      .getAllByRole('link')
      .find((a) => a.getAttribute('href') === '/administraciones');
    expect(link).toBeDefined();
    await userEvent.hover(link as HTMLElement);
    // Wait for the tooltip (Radix renders it with role="tooltip" in a portal).
    const tooltip = await screen.findByRole('tooltip', {}, { timeout: 2000 });
    expect(tooltip).toHaveTextContent('Administraciones');
  });
});
