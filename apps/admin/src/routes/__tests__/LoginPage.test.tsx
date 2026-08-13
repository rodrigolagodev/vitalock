import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginPage from '../LoginPage';

const mockSignIn = vi.fn();

vi.mock('@/auth/AuthProvider', () => ({
  useAuthContext: () => ({
    signIn: mockSignIn,
    phase: 'idle',
    error: null,
  }),
}));

describe('LoginPage', () => {
  beforeEach(() => {
    mockSignIn.mockReset();
  });

  it('renders email and password fields with their labels', () => {
    render(<LoginPage />);
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Contraseña')).toBeInTheDocument();
  });

  it('renders the submit button with the expected label', () => {
    render(<LoginPage />);
    expect(screen.getByRole('button', { name: 'Ingresar' })).toBeInTheDocument();
  });

  it('submits the entered credentials through signIn', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.type(screen.getByLabelText('Email'), 'admin@vitalock.com');
    await user.type(screen.getByLabelText('Contraseña'), 'secreto');
    await user.click(screen.getByRole('button', { name: 'Ingresar' }));
    expect(mockSignIn).toHaveBeenCalledWith('admin@vitalock.com', 'secreto');
  });
});
