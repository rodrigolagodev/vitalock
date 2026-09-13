import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ReactNode } from 'react';

const mockCreateStaff = vi.fn();
const mockUpdateStaff = vi.fn();
const mockToastMutationError = vi.fn();

vi.mock('@/hooks/useMutateStaff', () => ({
  useMutateStaff: () => ({
    createStaff: { mutateAsync: mockCreateStaff, isPending: false },
    updateStaff: { mutateAsync: mockUpdateStaff, isPending: false },
  }),
}));

vi.mock('@/lib/errors/toast', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/errors/toast')>();
  return {
    ...actual,
    toastMutationError: (err: unknown) => mockToastMutationError(err),
  };
});

import { StaffFormSheet } from '../StaffFormSheet';

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>, username = 'juan.perez') {
  await user.type(screen.getByLabelText(/Nombre/), 'Juan Perez');
  await user.type(screen.getByLabelText(/Usuario/), username);
  await user.click(screen.getByRole('combobox'));
  await user.click(await screen.findByRole('option', { name: 'Instalador' }));
}

describe('StaffFormSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateStaff.mockResolvedValue({ id: 's-1' });
  });

  it('renders a required Usuario field', () => {
    render(<StaffFormSheet open onOpenChange={vi.fn()} />, { wrapper: makeWrapper() });
    expect(screen.getByLabelText(/Usuario/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('ej. juan.perez')).toBeInTheDocument();
  });

  it('rejects a malformed username client-side and does not submit', async () => {
    const user = userEvent.setup();
    render(<StaffFormSheet open onOpenChange={vi.fn()} />, { wrapper: makeWrapper() });

    await user.type(screen.getByLabelText(/Nombre/), 'Juan Perez');
    await user.type(screen.getByLabelText(/Usuario/), 'Ab');
    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Instalador' }));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Usuario inválido')).toBeInTheDocument();
    expect(mockCreateStaff).not.toHaveBeenCalled();
  });

  it('submits the username on create', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<StaffFormSheet open onOpenChange={onOpenChange} />, { wrapper: makeWrapper() });

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(mockCreateStaff).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'juan.perez' }),
    );
  });

  it('surfaces a duplicate username as an inline field error, not a toast', async () => {
    const user = userEvent.setup();
    mockCreateStaff.mockRejectedValueOnce({
      code: '23505',
      message: 'duplicate key value violates unique constraint',
      details: 'Key (username)=(juan.perez) conflicts with existing key in "staff_username_key".',
    });

    render(<StaffFormSheet open onOpenChange={vi.fn()} />, { wrapper: makeWrapper() });

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Ese usuario ya existe.')).toBeInTheDocument();
    expect(mockToastMutationError).not.toHaveBeenCalled();
  });
});
