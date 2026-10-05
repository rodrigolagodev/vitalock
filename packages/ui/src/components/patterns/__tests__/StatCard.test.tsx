import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { StatCard } from '@vitalock/ui';

describe('StatCard', () => {
  it('renders the label at callout and the value at title-2 with tabular numerals', () => {
    render(<StatCard label="Equipos" value={42} />);
    expect(screen.getByText('Equipos')).toHaveClass('text-callout', 'text-muted-foreground');
    expect(screen.getByText('42')).toHaveClass('text-title-2', 'tabular-nums');
  });

  it('shows an em dash for a missing value', () => {
    render(<StatCard label="Llaves" value={null} />);
    expect(screen.getByText('—')).toHaveClass('tabular-nums');
  });

  it('uses the container radius and a control-radius icon tile', () => {
    render(<StatCard label="Tareas" value="7" icon={<svg data-testid="ico" />} />);
    const tile = screen.getByTestId('ico').parentElement;
    expect(tile).toHaveClass('rounded-control');
    expect(tile?.parentElement).toHaveClass('rounded-container');
  });
});
