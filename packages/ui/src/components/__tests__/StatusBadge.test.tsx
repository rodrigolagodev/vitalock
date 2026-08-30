import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { StatusBadge, type StatusTone } from '@vitalock/ui';

describe('StatusBadge', () => {
  it.each<StatusTone>([
    'neutral',
    'info',
    'brand',
    'warning',
    'success',
    'danger',
  ])('renders label for tone %s', (tone) => {
    render(<StatusBadge tone={tone}>Estado</StatusBadge>);
    expect(screen.getByText('Estado')).toBeInTheDocument();
  });

  it('renders every tone with the same pill format (text-xs + rounded-full)', () => {
    const tones: StatusTone[] = [
      'neutral',
      'info',
      'brand',
      'warning',
      'success',
      'danger',
    ];
    const { container } = render(
      <div>
        {tones.map((tone) => (
          <StatusBadge key={tone} tone={tone}>
            {tone}
          </StatusBadge>
        ))}
      </div>,
    );
    const badges = container.querySelectorAll('[class*="rounded-full"]');
    expect(badges.length).toBe(tones.length);
    for (const badge of badges) {
      expect(badge.className).toContain('text-xs');
    }
  });

  it('renders with a custom className merged on top of the tone', () => {
    const { container } = render(
      <StatusBadge tone="success" className="uppercase">
        Listo
      </StatusBadge>,
    );
    const badge = container.querySelector('[class*="rounded-full"]');
    expect(badge).not.toBeNull();
    expect(badge!.className).toContain('uppercase');
  });
});
