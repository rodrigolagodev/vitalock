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

  it('renders email and password fields with their labels', () => {
    render(<LoginPage />);
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Contraseña')).toBeInTheDocument();
  });

  it('uses an email input with autoComplete="email"', () => {
    render(<LoginPage />);
    const email = screen.getByLabelText('Email');
    expect(email).toHaveAttribute('type', 'email');
    expect(email).toHaveAttribute('autoComplete', 'email');
  });

  it('renders the submit button with the expected label', () => {
    render(<LoginPage />);
    expect(screen.getByRole('button', { name: 'Ingresar' })).toBeInTheDocument();
  });

  it('submits a trimmed email through signIn', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.type(screen.getByLabelText('Email'), '  ana@vitalock.example  ');
    await user.type(screen.getByLabelText('Contraseña'), 'secreto123');
    await user.click(screen.getByRole('button', { name: 'Ingresar' }));
    expect(mockSignIn).toHaveBeenCalledWith('ana@vitalock.example', 'secreto123');
  });

  it('shows an inline validation message and does not call signIn for a username instead of an email', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.type(screen.getByLabelText('Email'), 'ana');
    await user.type(screen.getByLabelText('Contraseña'), 'secreto123');
    await user.click(screen.getByRole('button', { name: 'Ingresar' }));
    expect(await screen.findByText('Email inválido')).toBeInTheDocument();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('shows validation errors and does not call signIn when fields are empty', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.click(screen.getByRole('button', { name: 'Ingresar' }));
    expect(await screen.findByText('Email inválido')).toBeInTheDocument();
    expect(mockSignIn).not.toHaveBeenCalled();
  });
});
