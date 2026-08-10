import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TareaStatusBadge } from '../TareaStatusBadge';

describe('TareaStatusBadge', () => {
  it('renders "Abierta" for open', () => {
    render(<TareaStatusBadge status="open" />);
    expect(screen.getByText('Abierta')).toBeInTheDocument();
  });

  it('renders "En curso" for in_progress', () => {
    render(<TareaStatusBadge status="in_progress" />);
    expect(screen.getByText('En curso')).toBeInTheDocument();
  });

  it('renders "Resuelta" for resolved', () => {
    render(<TareaStatusBadge status="resolved" />);
    expect(screen.getByText('Resuelta')).toBeInTheDocument();
  });

  it('renders "Cancelada" for cancelled', () => {
    render(<TareaStatusBadge status="cancelled" />);
    expect(screen.getByText('Cancelada')).toBeInTheDocument();
  });
});
