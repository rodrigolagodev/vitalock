import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from '../Sidebar';

const { useOrdensMock } = vi.hoisted(() => ({ useOrdensMock: vi.fn() }));

vi.mock('@/hooks/useOrdens', () => ({ useOrdens: useOrdensMock }));

function renderSidebar() {
  return render(
    <MemoryRouter initialEntries={['/ordenes']}>
      <Sidebar />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useOrdensMock.mockReturnValue({ data: [] });
});

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
      ['Ordenes', '/ordenes'],
      ['Tareas', '/tareas'],
      ['Personal', '/personal'],
      ['Stock', '/stock'],
    ] as const;
    for (const [label, href] of expected) {
      expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', href);
    }
  });

  it('renders each nav item label exactly once (no separate section labels)', () => {
    renderSidebar();
    expect(screen.getAllByText('Llaves')).toHaveLength(1);
    expect(screen.getAllByText('Ordenes')).toHaveLength(1);
    expect(screen.getAllByText('Personal')).toHaveLength(1);
  });

  it('renders the in-progress ordenes count as a badge pill', () => {
    useOrdensMock.mockReturnValue({ data: [{ id: 'o-1' }, { id: 'o-2' }, { id: 'o-3' }] });
    renderSidebar();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('hides the badge when there are no in-progress ordenes', () => {
    useOrdensMock.mockReturnValue({ data: [] });
    renderSidebar();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('hides the badge while ordenes have not loaded', () => {
    useOrdensMock.mockReturnValue({ data: undefined });
    renderSidebar();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });
});
