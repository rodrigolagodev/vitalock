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

function renderSidebar() {
  return render(
    <ThemeProvider attribute="class">
      <MemoryRouter initialEntries={['/ordenes']}>
        <Sidebar />
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
});
