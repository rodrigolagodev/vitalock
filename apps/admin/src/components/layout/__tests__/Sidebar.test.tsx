import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from '../Sidebar';

function renderSidebar() {
  return render(
    <MemoryRouter initialEntries={['/ordenes']}>
      <Sidebar />
    </MemoryRouter>,
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
      ['Llaves', '/llaves'],
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

  it('does not render a Historial nav link after rename', () => {
    renderSidebar();
    expect(screen.queryByRole('link', { name: 'Historial' })).not.toBeInTheDocument();
  });

  it('renders each nav item label exactly once (no separate section labels)', () => {
    renderSidebar();
    expect(screen.getAllByText('Llaves')).toHaveLength(1);
    expect(screen.getAllByText('Servicio técnico')).toHaveLength(1);
    expect(screen.getAllByText('Órdenes')).toHaveLength(1);
    expect(screen.getAllByText('Personal')).toHaveLength(1);
  });

  it('renders Órdenes link pointing to /ordenes', () => {
    renderSidebar();
    expect(screen.getByRole('link', { name: 'Órdenes' })).toHaveAttribute('href', '/ordenes');
  });
});
