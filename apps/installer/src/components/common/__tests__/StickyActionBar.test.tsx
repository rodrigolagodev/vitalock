import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StickyActionBar, ACTION_BAR_HINT_ID } from '../StickyActionBar';

describe('StickyActionBar', () => {
  it('renders its actions in a sticky, blurred bar', () => {
    render(
      <StickyActionBar>
        <button type="button">Finalizar tarea</button>
      </StickyActionBar>,
    );
    const bar = screen
      .getByRole('button', { name: 'Finalizar tarea' })
      .closest('[data-action-bar]');
    expect(bar).toHaveClass('sticky', 'bottom-0', 'backdrop-blur', 'border-t');
  });

  it('renders the hint as visible text with the shared id', () => {
    render(
      <StickyActionBar hint="Sin conexión">
        <button type="button" aria-describedby={ACTION_BAR_HINT_ID}>
          Finalizar tarea
        </button>
      </StickyActionBar>,
    );
    expect(screen.getByText('Sin conexión')).toHaveAttribute('id', ACTION_BAR_HINT_ID);
    expect(screen.getByRole('button', { name: 'Finalizar tarea' })).toHaveAccessibleDescription(
      'Sin conexión',
    );
  });

  it('renders no hint element when none is given', () => {
    const { container } = render(
      <StickyActionBar>
        <button type="button">Ok</button>
      </StickyActionBar>,
    );
    expect(container.querySelector(`#${ACTION_BAR_HINT_ID}`)).toBeNull();
  });
});
