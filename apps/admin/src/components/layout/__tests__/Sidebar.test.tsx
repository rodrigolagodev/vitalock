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
  it('renders the brand header (logo + wordmark) above the navigation', () => {
    renderSidebar();
    expect(screen.getByText('Vitalock')).toBeInTheDocument();
  });

  it('renders the five section labels in the D5 grouping', () => {
    renderSidebar();
    // "Ordenes" and "Personal" are also NavItem labels, so they match twice —
    // the dedicated tests below assert those splits.
    for (const label of ['Infraestructura', 'Ventas', 'Tickets']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    for (const label of ['Ordenes', 'Personal']) {
      expect(screen.getAllByText(label).length).toBeGreaterThanOrEqual(1);
    }
  });

  it('keeps every routed item a live navigation link', () => {
    renderSidebar();
    const expected = [
      ['Administraciones', '/administraciones'],
      ['Particulares', '/particulares'],
      ['Ordenes', '/ordenes'],
      ['Tareas', '/tareas'],
      ['Personal', '/personal'],
      ['Stock', '/stock'],
    ] as const;
    for (const [label, href] of expected) {
      expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', href);
    }
  });

  it('renders section labels as non-interactive (no click target)', () => {
    renderSidebar();
    for (const label of ['Infraestructura', 'Ventas', 'Tickets']) {
      expect(screen.queryByRole('link', { name: label })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument();
    }
  });

  it('shows the Ordenes section label and the Ordenes nav item separately', () => {
    renderSidebar();
    expect(screen.getAllByText('Ordenes')).toHaveLength(2);
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
