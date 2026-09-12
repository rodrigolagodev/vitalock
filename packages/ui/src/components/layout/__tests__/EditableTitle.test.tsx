import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { EditableTitle } from '@vitalock/ui';

describe('EditableTitle', () => {
  it('shows the value, adornment and a rename affordance when idle', () => {
    render(<EditableTitle value="Cerradura" onSave={vi.fn()} adornment={<em>badge</em>} />);
    expect(screen.getByText('Cerradura')).toBeInTheDocument();
    expect(screen.getByText('badge')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Renombrar' })).toBeInTheDocument();
  });

  it('saves the trimmed draft on Enter and leaves edit mode', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<EditableTitle value="Cerradura" onSave={onSave} />);
    await user.click(screen.getByRole('button', { name: 'Renombrar' }));
    const input = screen.getByRole('textbox', { name: 'Nombre del producto' });
    await user.clear(input);
    await user.type(input, '  Cerradura 2  {Enter}');
    expect(onSave).toHaveBeenCalledWith('Cerradura 2');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('does not save when the draft is unchanged or empty', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<EditableTitle value="Cerradura" onSave={onSave} />);
    await user.click(screen.getByRole('button', { name: 'Renombrar' }));
    await user.click(screen.getByRole('button', { name: 'Guardar nombre' }));
    expect(onSave).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Renombrar' }));
    await user.clear(screen.getByRole('textbox'));
    await user.click(screen.getByRole('button', { name: 'Guardar nombre' }));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('discards the draft on Escape and on Cancelar', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<EditableTitle value="Cerradura" onSave={onSave} />);

    await user.click(screen.getByRole('button', { name: 'Renombrar' }));
    await user.type(screen.getByRole('textbox'), ' extra{Escape}');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText('Cerradura')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Renombrar' }));
    await user.type(screen.getByRole('textbox'), ' extra');
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('ignores confirm and cancel while saving', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<EditableTitle value="Cerradura" onSave={onSave} />);
    await user.click(screen.getByRole('button', { name: 'Renombrar' }));
    rerender(<EditableTitle value="Cerradura" onSave={onSave} isSaving />);
    await user.type(screen.getByRole('textbox'), ' x{Escape}');
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });
});
