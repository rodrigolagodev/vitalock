import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { UserMenu, initialsFromName } from '@vitalock/ui';

describe('initialsFromName', () => {
  it('takes the first letter of up to two words, uppercased', () => {
    expect(initialsFromName('Ana Alvarez')).toBe('AA');
    expect(initialsFromName('juan carlos perez')).toBe('JC');
    expect(initialsFromName('Solo')).toBe('S');
    expect(initialsFromName('')).toBe('');
  });
});

describe('UserMenu', () => {
  it('shows initials, name, email and the trigger when expanded', () => {
    render(<UserMenu name="Ana Alvarez" email="ana@vitalock.com" onSignOut={vi.fn()} />);
    expect(screen.getByText('AA')).toBeInTheDocument();
    expect(screen.getByText('Ana Alvarez')).toBeInTheDocument();
    expect(screen.getByText('ana@vitalock.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abrir menú de usuario' })).toBeInTheDocument();
  });

  it('falls back to US initials when the name yields none', () => {
    render(<UserMenu name="" onSignOut={vi.fn()} />);
    expect(screen.getByText('US')).toBeInTheDocument();
  });

  it('hides name and email from AT when collapsed but keeps them in DOM for stable layout', () => {
    render(<UserMenu name="Ana Alvarez" email="ana@vitalock.com" onSignOut={vi.fn()} collapsed />);
    const wrapper = screen.getByText('Ana Alvarez').parentElement;
    expect(wrapper).toHaveAttribute('aria-hidden', 'true');
    expect(wrapper?.className).toContain('opacity-0');
    expect(screen.getByText('ana@vitalock.com').parentElement).toBe(wrapper);
  });

  it('renders the theme row slot and calls onSignOut from the Salir action', async () => {
    const onSignOut = vi.fn();
    const user = userEvent.setup();
    render(
      <UserMenu name="Ana Alvarez" email="ana@vitalock.com" onSignOut={onSignOut}>
        <button type="button">toggle-theme</button>
      </UserMenu>,
    );

    await user.click(screen.getByRole('button', { name: 'Abrir menú de usuario' }));
    expect(screen.getByText('Tema')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'toggle-theme' })).toBeInTheDocument();
    // Email is rendered both on the trigger and inside the popover header.
    expect(screen.getAllByText('ana@vitalock.com').length).toBeGreaterThan(1);

    await user.click(screen.getByRole('button', { name: /Salir/ }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it('omits the theme row when no children are given', async () => {
    const user = userEvent.setup();
    render(<UserMenu name="Ana Alvarez" onSignOut={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Abrir menú de usuario' }));
    expect(screen.queryByText('Tema')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Salir/ })).toBeInTheDocument();
  });
});
