import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tooltip } from '../tooltip';

describe('Tooltip primitive from @vitalock/ui', () => {
  it('shows the content in a portal when the trigger is hovered', async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <Tooltip content="Detalle de label">
        <button type="button">Administraciones</button>
      </Tooltip>,
    );

    await user.hover(screen.getByText('Administraciones'));
    // Content renders when open, with distinct text from the trigger.
    expect(await screen.findByText('Detalle de label', {}, { timeout: 2000 })).toBeInTheDocument();
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
  });

  it('does not render tooltip content when the trigger is not hovered', () => {
    render(
      <Tooltip content="Contenido oculto" delayDuration={0}>
        <button type="button">Etiqueta</button>
      </Tooltip>,
    );
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('renders content on the requested side', async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <Tooltip content="A la izquierda" side="left" delayDuration={0}>
        <button type="button">Disparador</button>
      </Tooltip>,
    );

    await user.hover(screen.getByText('Disparador'));
    expect(await screen.findByRole('tooltip', {}, { timeout: 2000 })).toBeInTheDocument();
    expect(screen.getByText('A la izquierda')).toBeInTheDocument();
  });
});
