import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TareaStatusBadge } from '../TareaStatusBadge';

describe('TareaStatusBadge', () => {
  it('renders "Pendiente" for open', () => {
    render(<TareaStatusBadge status="open" />);
    expect(screen.getByText('Pendiente')).toBeInTheDocument();
  });

  it('renders "En curso" for in_progress', () => {
    render(<TareaStatusBadge status="in_progress" />);
    expect(screen.getByText('En curso')).toBeInTheDocument();
  });

  it('renders "Finalizada" for resolved', () => {
    render(<TareaStatusBadge status="resolved" />);
    expect(screen.getByText('Finalizada')).toBeInTheDocument();
  });

  it('renders "Cancelada" for cancelled', () => {
    render(<TareaStatusBadge status="cancelled" />);
    expect(screen.getByText('Cancelada')).toBeInTheDocument();
  });
});
