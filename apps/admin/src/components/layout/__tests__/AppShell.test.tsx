import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from 'next-themes';
import { AppShell } from '../AppShell';

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
});
