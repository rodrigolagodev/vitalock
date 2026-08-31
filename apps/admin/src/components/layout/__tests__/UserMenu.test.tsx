import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from 'next-themes';
import { UserMenu } from '../UserMenu';

const { useAuthContextMock } = vi.hoisted(() => ({
  useAuthContextMock: vi.fn(() => ({
    staff: { full_name: 'Ana Alvarez' },
    session: { user: { email: 'ana@vitalock.com' } },
    signOut: vi.fn(),
  })),
}));

vi.mock('@vitalock/shared', () => ({ useAuthContext: useAuthContextMock }));

function renderUserMenu(collapsed?: boolean) {
  return render(
    <ThemeProvider attribute="class">
      <UserMenu collapsed={collapsed} />
    </ThemeProvider>,
  );
}

describe('UserMenu', () => {
  it('shows name, email and trigger when expanded', () => {
    renderUserMenu(false);
    expect(screen.getByText('Ana Alvarez')).toBeInTheDocument();
    expect(screen.getByText('ana@vitalock.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abrir menú de usuario' })).toBeInTheDocument();
  });

  it('hides name and email from AT when collapsed but keeps them in DOM for stable layout', () => {
    renderUserMenu(true);
    // Avatar initials still present and visible.
    expect(screen.getByText('AA')).toBeInTheDocument();
    // Name and email stay in the DOM (so the trigger keeps a constant size
    // during the sidebar collapse animation), but they are aria-hidden and
    // wrapped in an opacity-0 container so users see the avatar only.
    const name = screen.getByText('Ana Alvarez');
    const email = screen.getByText('ana@vitalock.com');
    const wrapper = name.parentElement;
    expect(wrapper).toHaveAttribute('aria-hidden', 'true');
    expect(wrapper?.className).toContain('opacity-0');
    expect(email.parentElement).toBe(wrapper);
  });
});
