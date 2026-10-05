import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mutate = vi.fn();
vi.mock('@/hooks/useAddComment', () => ({
  useAddComment: () => ({ mutate, isPending: false }),
}));

import { AddCommentForm } from '../AddCommentForm';

describe('AddCommentForm', () => {
  it('keeps "Comentar" disabled until there is text, then submits the trimmed body', async () => {
    const user = userEvent.setup();
    render(<AddCommentForm ticketId="t-1" />);
    const submit = screen.getByRole('button', { name: 'Comentar' });
    expect(submit).toBeDisabled();
    await user.type(screen.getByPlaceholderText('Escribí un comentario…'), '  Listo  ');
    expect(submit).toBeEnabled();
    await user.click(submit);
    expect(mutate).toHaveBeenCalledWith({ ticketId: 't-1', body: 'Listo' }, expect.any(Object));
  });

  it('renders the submit button at the 44px default control height', () => {
    render(<AddCommentForm ticketId="t-1" />);
    const submit = screen.getByRole('button', { name: 'Comentar' });
    expect(submit).toHaveClass('h-control-md');
    expect(submit).not.toHaveClass('h-control-sm');
  });
});
