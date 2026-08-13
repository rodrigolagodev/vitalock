import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

// Import through the package entry point — the public contract consumers
// (admin + installer) will rely on.
import { SearchInput, SidebarGroup, Topbar } from '@vitalock/ui';

describe('SidebarGroup', () => {
  it('renders the section label above the group', () => {
    render(<SidebarGroup label="Infraestructura" />);
    expect(screen.getByText('Infraestructura')).toBeInTheDocument();
  });

  it('renders its children below the label', () => {
    render(
      <SidebarGroup label="Ordenes">
        <a href="/ordenes">Ver órdenes</a>
      </SidebarGroup>,
    );
    expect(screen.getByText('Ordenes')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver órdenes' })).toHaveAttribute(
      'href',
      '/ordenes',
    );
  });

  it('renders a label-only group (empty placeholder section)', () => {
    render(<SidebarGroup label="Tickets" />);
    expect(screen.getByText('Tickets')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});

describe('SearchInput', () => {
  it('renders an input with the provided placeholder', () => {
    render(<SearchInput placeholder="Buscar..." />);
    expect(screen.getByPlaceholderText('Buscar...')).toBeInTheDocument();
  });

  it('is a visual placeholder: typing updates the value and never navigates or submits', () => {
    render(<SearchInput size="lg" placeholder="Buscar..." />);

    const input = screen.getByPlaceholderText('Buscar...');
    fireEvent.change(input, { target: { value: 'llaves' } });

    // Default input behavior still works (uncontrolled value).
    expect(input).toHaveValue('llaves');

    // The search field must not carry navigation or implicit submit: no links
    // and no wrapping form are rendered anywhere in the control.
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
  });

  it('forwards typed input at the lg size', () => {
    render(<SearchInput size="lg" placeholder="Buscar..." />);
    const input = screen.getByPlaceholderText('Buscar...');
    fireEvent.change(input, { target: { value: 'stock' } });
    expect(input).toHaveValue('stock');
  });
});

describe('Topbar', () => {
  it('renders search, notification bell, avatar and divider', () => {
    render(<Topbar avatar="AA" />);

    expect(screen.getByPlaceholderText('Buscar...')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Notificaciones' }),
    ).toBeInTheDocument();
    expect(screen.getByText('AA')).toBeInTheDocument();
    expect(screen.getByTestId('topbar-divider')).toBeInTheDocument();
  });

  it('renders the children slot next to the avatar', () => {
    render(
      <Topbar avatar="AA">
        <button type="button">Salir</button>
      </Topbar>,
    );
    expect(screen.getByRole('button', { name: 'Salir' })).toBeInTheDocument();
  });

  it('renders without optional avatar and children', () => {
    render(<Topbar />);
    expect(screen.getByRole('button', { name: 'Notificaciones' })).toBeInTheDocument();
    expect(screen.queryByText('AA')).not.toBeInTheDocument();
  });
});
