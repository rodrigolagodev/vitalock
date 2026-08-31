import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from 'next-themes';
import { AppShell } from '../AppShell';

function clearStoredCollapsed() {
  window.localStorage.removeItem('vitalock-sidebar-collapsed');
}

const { useAuthContextMock } = vi.hoisted(() => ({
  useAuthContextMock: vi.fn(),
}));

vi.mock('@vitalock/shared', () => ({ useAuthContext: useAuthContextMock }));

function renderShell() {
  return render(
    <ThemeProvider attribute="class">
      <MemoryRouter initialEntries={['/ordenes']}>
        <AppShell />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  useAuthContextMock.mockReturnValue({
    staff: { full_name: 'Ana Alvarez' },
    session: { user: { email: 'ana@vitalock.com' } },
    signOut: vi.fn(),
  });
  clearStoredCollapsed();
});

describe('AppShell', () => {
  it('renders the sidebar with brand logo and navigation', () => {
    renderShell();
    // Brand logo appears at least once (desktop sidebar; mobile topbar is hidden by media query).
    expect(screen.getAllByAltText('Vitalock').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Administraciones' })).toHaveAttribute(
      'href',
      '/administraciones',
    );
  });

  it('renders the user menu trigger with initials and name', () => {
    renderShell();
    expect(screen.getByText('AA')).toBeInTheDocument();
    expect(screen.getByText('Ana Alvarez')).toBeInTheDocument();
  });

  it('exposes theme toggle and sign-out inside the user menu popover', async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole('button', { name: 'Abrir menú de usuario' }));

    expect(
      screen.getByRole('switch', { name: 'Cambiar entre tema claro y oscuro' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Salir/ })).toBeInTheDocument();
    // Email is rendered both on the trigger and inside the popover header.
    expect(screen.getAllByText('ana@vitalock.com').length).toBeGreaterThan(0);
  });

  it('signs out when the Salir action is clicked', async () => {
    const signOut = vi.fn();
    useAuthContextMock.mockReturnValue({
      staff: { full_name: 'Ana Alvarez' },
      session: { user: { email: 'ana@vitalock.com' } },
      signOut,
    });
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole('button', { name: 'Abrir menú de usuario' }));
    await user.click(screen.getByRole('button', { name: /Salir/ }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('renders the desktop sidebar expanded by default', () => {
    renderShell();
    const aside = screen.getByRole('complementary');
    expect(aside).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'Administraciones' })).toBeInTheDocument();
  });

  it('collapses and expands when the toggle button is clicked', async () => {
    const user = userEvent.setup();
    renderShell();

    // Expanded by default.
    const aside = screen.getByRole('complementary');
    expect(aside).toHaveAttribute('aria-expanded', 'true');
    const label = screen.getByText('Administraciones');
    expect(label).not.toHaveAttribute('aria-hidden', 'true');

    // Collapse. Label stays in the DOM (stable layout) but becomes aria-hidden.
    await user.click(screen.getByRole('button', { name: 'Toggle sidebar' }));
    expect(aside).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('Administraciones')).toHaveAttribute('aria-hidden', 'true');

    // Expand again.
    await user.click(screen.getByRole('button', { name: 'Toggle sidebar' }));
    expect(aside).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Administraciones')).not.toHaveAttribute('aria-hidden', 'true');
  });
});
