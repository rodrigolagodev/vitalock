import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mutate = vi.fn();
vi.mock('@/hooks/useAddComment', () => ({
  useAddComment: () => ({ mutate, isPending: false }),
}));

import { AddCommentForm } from '../AddCommentForm';

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value });
}

async function openSheet() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Agregar comentario' }));
  return user;
}

beforeEach(() => {
  mutate.mockReset();
  setOnline(true);
});
afterEach(() => setOnline(true));

describe('AddCommentForm', () => {
  it('keeps the form closed until the trigger opens a bottom sheet', async () => {
    render(<AddCommentForm ticketId="t-1" />);
    expect(screen.queryByPlaceholderText('Escribí un comentario…')).not.toBeInTheDocument();
    await openSheet();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Escribí un comentario…')).toBeInTheDocument();
  });

  it('keeps "Comentar" disabled until there is text, then submits the trimmed body', async () => {
    render(<AddCommentForm ticketId="t-1" />);
    const user = await openSheet();
    const submit = screen.getByRole('button', { name: 'Comentar' });
    expect(submit).toBeDisabled();
    await user.type(screen.getByPlaceholderText('Escribí un comentario…'), '  Listo  ');
    expect(submit).toBeEnabled();
    await user.click(submit);
    expect(mutate).toHaveBeenCalledWith({ ticketId: 't-1', body: 'Listo' }, expect.any(Object));
  });

  it('renders the trigger and submit button at the 44px default control height', async () => {
    render(<AddCommentForm ticketId="t-1" />);
    expect(screen.getByRole('button', { name: 'Agregar comentario' })).toHaveClass('h-control-md');
    await openSheet();
    const submit = screen.getByRole('button', { name: 'Comentar' });
    expect(submit).toHaveClass('h-control-md');
    expect(submit).not.toHaveClass('h-control-sm');
  });

  it('uses 16px text on every breakpoint so iOS does not zoom', async () => {
    render(<AddCommentForm ticketId="t-1" />);
    await openSheet();
    const field = screen.getByPlaceholderText('Escribí un comentario…');
    expect(field).not.toHaveClass('text-sm');
    expect(field).toHaveClass('md:text-base');
  });

  it('disables submit offline with a visible reason, even with text', async () => {
    render(<AddCommentForm ticketId="t-1" />);
    const user = await openSheet();
    await user.type(screen.getByPlaceholderText('Escribí un comentario…'), 'Hola');
    expect(screen.getByRole('button', { name: 'Comentar' })).toBeEnabled();
    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByRole('button', { name: 'Comentar' })).toBeDisabled();
    expect(screen.getByText('Sin conexión')).toBeInTheDocument();
  });

  it('closes the sheet and clears the text after a successful submit', async () => {
    mutate.mockImplementation((_vars, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.());
    render(<AddCommentForm ticketId="t-1" />);
    const user = await openSheet();
    await user.type(screen.getByPlaceholderText('Escribí un comentario…'), 'Hola');
    await user.click(screen.getByRole('button', { name: 'Comentar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await openSheet();
    expect(screen.getByPlaceholderText('Escribí un comentario…')).toHaveValue('');
  });

  it('closes via Cerrar without submitting', async () => {
    render(<AddCommentForm ticketId="t-1" />);
    const user = await openSheet();
    await user.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();
  });
});
