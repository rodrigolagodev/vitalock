import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Separator } from '../separator';

describe('Separator', () => {
  it('renders a horizontal separator by default', () => {
    render(<Separator data-testid="sep" />);
    const sep = screen.getByTestId('sep');
    expect(sep).toHaveAttribute('data-orientation', 'horizontal');
    expect(sep.className).toContain('h-[1px]');
  });

  it('renders a vertical separator when asked', () => {
    render(<Separator data-testid="sep" orientation="vertical" />);
    const sep = screen.getByTestId('sep');
    expect(sep).toHaveAttribute('data-orientation', 'vertical');
    expect(sep.className).toContain('w-[1px]');
  });

  it('is decorative by default so assistive tech ignores it', () => {
    render(<Separator data-testid="sep" />);
    expect(screen.getByTestId('sep')).toHaveAttribute('role', 'none');
  });

  it('exposes a separator role when not decorative', () => {
    render(<Separator decorative={false} />);
    expect(screen.getByRole('separator')).toBeInTheDocument();
  });
});
