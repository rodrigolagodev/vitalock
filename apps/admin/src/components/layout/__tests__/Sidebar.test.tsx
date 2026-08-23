import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from '../Sidebar';

function renderSidebar() {
  return render(
    <MemoryRouter initialEntries={['/historial']}>
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
      ['Historial', '/historial'],
      ['Tareas', '/tareas'],
      ['Personal', '/personal'],
      ['Stock', '/stock'],
    ] as const;
    for (const [label, href] of expected) {
      expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', href);
    }
  });

  it('does not render an Ordenes nav link after retirement', () => {
    renderSidebar();
    expect(screen.queryByRole('link', { name: 'Ordenes' })).not.toBeInTheDocument();
  });

  it('renders each nav item label exactly once (no separate section labels)', () => {
    renderSidebar();
    expect(screen.getAllByText('Llaves')).toHaveLength(1);
    expect(screen.getAllByText('Servicio técnico')).toHaveLength(1);
    expect(screen.getAllByText('Historial')).toHaveLength(1);
    expect(screen.getAllByText('Personal')).toHaveLength(1);
  });

  it('renders Historial link pointing to /historial', () => {
    renderSidebar();
    expect(screen.getByRole('link', { name: 'Historial' })).toHaveAttribute('href', '/historial');
  });
});
