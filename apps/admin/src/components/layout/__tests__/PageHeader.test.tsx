import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import type { ReactNode } from 'react';
import { PageHeader } from '../PageHeader';

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
    expect(
      screen.getByRole('button', { name: 'Nueva administración' }),
    ).toBeInTheDocument();
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
});
