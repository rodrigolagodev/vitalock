import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from 'next-themes';
import { UserMenu } from '../UserMenu';

const SESSION_EMAIL = 'ana@vitalock.com';

const { useAuthContextMock } = vi.hoisted(() => ({
  useAuthContextMock: vi.fn(() => ({
    staff: { full_name: 'Ana Alvarez', username: 'ana.alvarez' },
    session: { user: { email: 'ana@vitalock.com' } },
    signOut: vi.fn(),
  })),
}));

vi.mock('@vitalock/shared', () => ({ useAuthContext: useAuthContextMock }));

// next-themes reads window.matchMedia on mount; jsdom does not provide it.
const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
});

afterEach(() => {
  Object.defineProperty(window, 'matchMedia', { writable: true, value: originalMatchMedia });
});

function renderUserMenu(collapsed?: boolean) {
  return render(
    <ThemeProvider attribute="class">
      <UserMenu collapsed={collapsed} />
    </ThemeProvider>,
  );
}

describe('UserMenu (installer)', () => {
  it('shows name and @username subtitle when expanded', () => {
    renderUserMenu(false);
    expect(screen.getByText('Ana Alvarez')).toBeInTheDocument();
    expect(screen.getByText('@ana.alvarez')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abrir menú de usuario' })).toBeInTheDocument();
  });

  it('never renders the session email, even though the session carries one', () => {
    renderUserMenu(false);
    expect(screen.getByText('@ana.alvarez')).toBeInTheDocument();
    expect(screen.queryByText(SESSION_EMAIL)).not.toBeInTheDocument();
    expect(screen.queryByText(SESSION_EMAIL, { exact: false })).not.toBeInTheDocument();
  });
});
