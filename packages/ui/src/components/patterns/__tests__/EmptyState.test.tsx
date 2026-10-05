import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Inbox } from 'lucide-react';

import { EmptyState } from '@vitalock/ui';

describe('EmptyState', () => {
  it('keeps the compact message form as a plain paragraph', () => {
    render(<EmptyState message="Sin resultados." className="pl-5" />);
    const p = screen.getByText('Sin resultados.');
    expect(p.tagName).toBe('P');
    expect(p).toHaveClass('text-sm', 'text-muted-foreground', 'pl-5');
  });

  it('renders the rich form with icon, title, description and action', () => {
    const { container } = render(
      <EmptyState
        title="Todavía no hay llaves"
        description="Creá la primera desde el inventario."
        icon={Inbox}
        action={<button type="button">Nueva llave</button>}
      />,
    );
    expect(screen.getByText('Todavía no hay llaves')).toHaveClass('text-headline');
    expect(screen.getByText('Creá la primera desde el inventario.')).toHaveClass(
      'text-callout',
      'text-muted-foreground',
    );
    expect(screen.getByRole('button', { name: 'Nueva llave' })).toBeInTheDocument();
    const icon = container.querySelector('svg');
    expect(icon?.parentElement).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders only the title when the optional slots are omitted', () => {
    const { container } = render(<EmptyState title="Sin datos" />);
    expect(screen.getByText('Sin datos')).toBeInTheDocument();
    expect(container.querySelector('svg')).toBeNull();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
