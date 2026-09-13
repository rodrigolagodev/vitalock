import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginPage from '../LoginPage';

const mockSignIn = vi.fn();

vi.mock('@vitalock/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@vitalock/shared')>();
  return {
    ...actual,
    useAuthContext: () => ({
      signIn: mockSignIn,
      phase: 'idle',
      error: null,
    }),
  };
});

describe('LoginPage', () => {
  beforeEach(() => {
    mockSignIn.mockReset();
  });

  it('renders username and password fields with their labels', () => {
    render(<LoginPage />);
    expect(screen.getByLabelText('Usuario')).toBeInTheDocument();
    expect(screen.getByLabelText('Contraseña')).toBeInTheDocument();
  });

  it('sets autoComplete="username" on the username field', () => {
    render(<LoginPage />);
    expect(screen.getByLabelText('Usuario')).toHaveAttribute('autoComplete', 'username');
  });

  it('renders the submit button with the expected label', () => {
    render(<LoginPage />);
    expect(screen.getByRole('button', { name: 'Ingresar' })).toBeInTheDocument();
  });

  it('submits a lowercased, trimmed username through signIn', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.type(screen.getByLabelText('Usuario'), '  Ana.Alvarez  ');
    await user.type(screen.getByLabelText('Contraseña'), 'secreto123');
    await user.click(screen.getByRole('button', { name: 'Ingresar' }));
    expect(mockSignIn).toHaveBeenCalledWith('ana.alvarez', 'secreto123');
  });

  it('shows an inline validation message and does not call signIn for a malformed username', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.type(screen.getByLabelText('Usuario'), 'a@b');
    await user.type(screen.getByLabelText('Contraseña'), 'secreto123');
    await user.click(screen.getByRole('button', { name: 'Ingresar' }));
    expect(await screen.findByText('Usuario inválido')).toBeInTheDocument();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('shows validation errors and does not call signIn when fields are empty', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.click(screen.getByRole('button', { name: 'Ingresar' }));
    expect(await screen.findByText('Usuario inválido')).toBeInTheDocument();
    expect(mockSignIn).not.toHaveBeenCalled();
  });
});
