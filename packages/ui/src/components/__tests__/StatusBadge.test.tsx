import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CheckCircle } from 'lucide-react';

import { StatusBadge, type StatusTone } from '@vitalock/ui';

describe('StatusBadge', () => {
  it.each<StatusTone>(['neutral', 'info', 'brand', 'warning', 'success', 'danger'])(
    'renders label for tone %s',
    (tone) => {
      render(<StatusBadge tone={tone}>Estado</StatusBadge>);
      expect(screen.getByText('Estado')).toBeInTheDocument();
    },
  );

  it('renders every tone with the same pill format (text-xs + rounded-full)', () => {
    const tones: StatusTone[] = ['neutral', 'info', 'brand', 'warning', 'success', 'danger'];
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

  it('renders an icon before the label when icon is provided', () => {
    const { container } = render(
      <StatusBadge tone="success" icon={CheckCircle}>
        Activo
      </StatusBadge>,
    );
    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(screen.getByText('Activo')).toBeInTheDocument();
  });

  it('renders without an icon when none is provided (backward compatible)', () => {
    const { container } = render(<StatusBadge tone="success">Activo</StatusBadge>);
    expect(container.querySelector('svg')).not.toBeInTheDocument();
    expect(screen.getByText('Activo')).toBeInTheDocument();
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
