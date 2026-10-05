import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ConfirmDialog } from '@vitalock/ui';

function setup(props: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
  const onConfirm = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <ConfirmDialog
      open
      onOpenChange={onOpenChange}
      onConfirm={onConfirm}
      title="¿Seguro?"
      description="Se pierde todo."
      {...props}
    />,
  );
  return { onConfirm, onOpenChange };
}

describe('ConfirmDialog', () => {
  it('renders a string description', () => {
    setup();
    expect(screen.getByText('Se pierde todo.')).toBeInTheDocument();
  });

  it('renders a node description inside the described-by element', () => {
    setup({
      description: (
        <>
          Se dará de baja a <strong>Ana</strong>.
        </>
      ),
    });
    const dialog = screen.getByRole('dialog');
    const describedBy = dialog.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const description = document.getElementById(describedBy as string);
    expect(description).toHaveTextContent('Se dará de baja a Ana.');
    expect(description?.querySelector('strong')).toHaveTextContent('Ana');
  });

  it('uses "Procesando..." as the default pending label', () => {
    setup({ isPending: true });
    expect(screen.getByRole('button', { name: 'Procesando...' })).toBeDisabled();
  });

  it('uses a custom pending label', () => {
    setup({ isPending: true, pendingLabel: 'Dando de baja...' });
    expect(screen.getByRole('button', { name: 'Dando de baja...' })).toBeDisabled();
    expect(screen.queryByText('Procesando...')).not.toBeInTheDocument();
  });

  it('disables the cancel button while pending', () => {
    setup({ isPending: true });
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
  });

  it('calls onConfirm once on confirm and onOpenChange(false) on cancel', async () => {
    const user = userEvent.setup();
    const { onConfirm, onOpenChange } = setup({ confirmLabel: 'Sí' });
    await user.click(screen.getByRole('button', { name: 'Sí' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
