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
    await user.type(screen.getByLabelText('Email'), '  bruno@vitalock.example  ');
    await user.type(screen.getByLabelText('Contraseña'), 'secreto123');
    await user.click(screen.getByRole('button', { name: 'Ingresar' }));
    expect(mockSignIn).toHaveBeenCalledWith('bruno@vitalock.example', 'secreto123');
  });

  it('shows an inline validation message and does not call signIn for a username instead of an email', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.type(screen.getByLabelText('Email'), 'bruno');
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

  it('announces field errors with role=alert and marks both fields invalid', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.click(screen.getByRole('button', { name: 'Ingresar' }));
    const alerts = await screen.findAllByRole('alert');
    expect(alerts.map((a) => a.textContent)).toEqual([
      'Email inválido',
      'La contraseña debe tener al menos 8 caracteres',
    ]);
    const email = screen.getByLabelText('Email');
    const password = screen.getByLabelText('Contraseña');
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(email.getAttribute('aria-describedby')).toBe(alerts[0]?.id);
    expect(password).toHaveAttribute('aria-invalid', 'true');
    expect(password.getAttribute('aria-describedby')).toBe(alerts[1]?.id);
  });

  it('leaves fields valid while untouched', () => {
    render(<LoginPage />);
    expect(screen.getByLabelText('Email')).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
