import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import type { ReactNode } from 'react';
import { PageHeader } from '@vitalock/ui';

function makeWrapper() {
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(MemoryRouter, null, children);
  };
}

describe('PageHeader', () => {
  it('renders title, subtitle and action children', () => {
    render(
      <PageHeader title="Administraciones" subtitle="Gestioná las administraciones.">
        <button type="button">Nueva administración</button>
      </PageHeader>,
      { wrapper: makeWrapper() },
    );

    expect(screen.getByRole('heading', { name: 'Administraciones' })).toBeInTheDocument();
    expect(screen.getByText('Gestioná las administraciones.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nueva administración' })).toBeInTheDocument();
  });

  it('renders a breadcrumb link with the correct href and no trailing separator', () => {
    render(
      <PageHeader
        title="Administración"
        breadcrumbs={[{ label: 'Administraciones', to: '/administraciones' }]}
      />,
      { wrapper: makeWrapper() },
    );

    const link = screen.getByRole('link', { name: 'Administraciones' });
    expect(link).toHaveAttribute('href', '/administraciones');
    expect(screen.queryAllByText('/')).toHaveLength(0);
  });

  it('renders separators between breadcrumb items but not after the last one', () => {
    const { container } = render(
      <PageHeader
        title="Edificio"
        breadcrumbs={[
          { label: 'Administraciones', to: '/administraciones' },
          { label: 'Administración', to: '/administraciones/1' },
        ]}
      />,
      { wrapper: makeWrapper() },
    );

    expect(screen.getByRole('link', { name: 'Administraciones' })).toHaveAttribute(
      'href',
      '/administraciones',
    );
    expect(screen.getByRole('link', { name: 'Administración' })).toHaveAttribute(
      'href',
      '/administraciones/1',
    );
    // ChevronRight separator icon between the two crumbs (never after the last one).
    expect(container.querySelectorAll('svg')).toHaveLength(1);
  });

  it('renders a crumb without a link as plain text', () => {
    render(
      <PageHeader
        title="Edificio"
        breadcrumbs={[
          { label: 'Administraciones', to: '/administraciones' },
          { label: 'Sin administración' },
        ]}
      />,
      { wrapper: makeWrapper() },
    );

    expect(screen.getByText('Sin administración')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Sin administración' })).not.toBeInTheDocument();
  });

  it('renders the h1 at title-1 and still merges titleClassName', () => {
    render(<PageHeader title="Edificio" titleClassName="font-mono" />, { wrapper: makeWrapper() });
    const h1 = screen.getByRole('heading', { level: 1, name: 'Edificio' });
    expect(h1).toHaveClass('text-title-1', 'font-mono');
    expect(h1).not.toHaveClass('text-2xl');
  });

  it('renders the breadcrumb at footnote with small chevrons', () => {
    const { container } = render(
      <PageHeader title="Edificio" breadcrumbs={[{ label: 'A', to: '/a' }, { label: 'B' }]} />,
      { wrapper: makeWrapper() },
    );
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveClass('text-footnote');
    expect(container.querySelector('svg')).toHaveClass('h-3.5', 'w-3.5');
  });

  it('renders the h1 at large-title when titleSize is large-title', () => {
    render(<PageHeader title="Inicio" titleSize="large-title" titleClassName="font-mono" />, {
      wrapper: makeWrapper(),
    });
    const h1 = screen.getByRole('heading', { level: 1, name: 'Inicio' });
    expect(h1).toHaveClass('text-large-title', 'font-mono');
    expect(h1).not.toHaveClass('text-title-1');
  });
});
