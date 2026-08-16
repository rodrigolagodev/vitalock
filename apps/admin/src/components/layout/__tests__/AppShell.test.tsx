import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from 'next-themes';
import { AppShell } from '../AppShell';

const { useAuthContextMock, useOrdensMock } = vi.hoisted(() => ({
  useAuthContextMock: vi.fn(),
  useOrdensMock: vi.fn(),
}));

vi.mock('@vitalock/shared', () => ({ useAuthContext: useAuthContextMock }));
vi.mock('@/hooks/useOrdens', () => ({ useOrdens: useOrdensMock }));

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
    signOut: vi.fn(),
  });
  useOrdensMock.mockReturnValue({ data: [] });
});

describe('AppShell', () => {
  it('renders the topbar with avatar initials, divider and actions', () => {
    renderShell();

    expect(screen.getByText('AA')).toBeInTheDocument();
    expect(screen.getByTestId('topbar-divider')).toBeInTheDocument();
    // Right slot: dark-mode switch and sign-out stay available.
    expect(screen.getByRole('switch')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salir' })).toBeInTheDocument();
  });

  it('keeps the sidebar with brand logo visible', () => {
    renderShell();
    expect(screen.getByAltText('Vitalock')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Administraciones' })).toHaveAttribute(
      'href',
      '/administraciones',
    );
  });

  it('signs out when the Salir action is clicked', async () => {
    const signOut = vi.fn();
    useAuthContextMock.mockReturnValue({
      staff: { full_name: 'Ana Alvarez' },
      signOut,
    });
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole('button', { name: 'Salir' }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
