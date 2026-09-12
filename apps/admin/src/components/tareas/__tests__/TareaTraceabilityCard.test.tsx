import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { TareaTimelineSource } from '@/lib/tareas/tareaTimeline';
import type { TicketComment } from '@/hooks/useTicketComments';
import { TareaTraceabilityCard } from '../TareaTraceabilityCard';

function makeSource(overrides: Partial<TareaTimelineSource> = {}): TareaTimelineSource {
  return {
    status: 'open',
    opened_at: '2026-09-01T10:00:00Z',
    opened_by_name: 'Ana Gómez',
    assigned_to_name: null,
    updated_at: '2026-09-01T10:00:00Z',
    resolved_at: null,
    resolved_by_name: null,
    resolution_notes: null,
    cancellation_reason: null,
    ...overrides,
  };
}

const comment: TicketComment = {
  id: 'c-1',
  ticket_id: 't-1',
  body: 'Llegué al edificio.',
  created_at: '2026-09-02T12:00:00Z',
  author_staff_id: 's-2',
  author_full_name: 'Pablo Ruiz',
};

describe('TareaTraceabilityCard', () => {
  it('renders the timeline rows in order: Abierta → Asignada a → Finalizada', () => {
    render(
      <TareaTraceabilityCard
        tarea={makeSource({
          status: 'resolved',
          assigned_to_name: 'Pablo Ruiz',
          resolved_at: '2026-09-03T16:45:00Z',
          resolved_by_name: 'Pablo Ruiz',
          resolution_notes: 'Cilindro reemplazado.',
        })}
        comments={[]}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Trazabilidad' })).toBeInTheDocument();
    const steps = within(screen.getByRole('list', { name: 'Línea de tiempo' })).getAllByRole(
      'listitem',
    );
    expect(steps.map((s) => s.textContent)).toEqual([
      expect.stringContaining('Abierta · Ana Gómez'),
      expect.stringContaining('Asignada a · Pablo Ruiz'),
      expect.stringContaining('Finalizada · Pablo Ruiz'),
    ]);
    expect(steps[2]).toHaveTextContent('Cilindro reemplazado.');
  });

  it('renders a Cancelada step with the reason for cancelled tickets', () => {
    render(
      <TareaTraceabilityCard
        tarea={makeSource({
          status: 'cancelled',
          updated_at: '2026-09-04T09:00:00Z',
          cancellation_reason: 'Duplicada.',
        })}
        comments={[]}
      />,
    );
    const steps = within(screen.getByRole('list', { name: 'Línea de tiempo' })).getAllByRole(
      'listitem',
    );
    expect(steps).toHaveLength(2);
    expect(steps[1]).toHaveTextContent('Cancelada');
    expect(steps[1]).toHaveTextContent('Duplicada.');
  });

  it('shows the comments empty state', () => {
    render(<TareaTraceabilityCard tarea={makeSource()} comments={[]} />);
    expect(screen.getByText('Sin comentarios.')).toBeInTheDocument();
  });

  it('lists comments with author, date and body', () => {
    render(<TareaTraceabilityCard tarea={makeSource()} comments={[comment]} />);
    const list = screen.getByRole('list', { name: 'Comentarios' });
    expect(within(list).getByText('Pablo Ruiz')).toBeInTheDocument();
    expect(within(list).getByText('Llegué al edificio.')).toBeInTheDocument();
    expect(screen.queryByText('Sin comentarios.')).not.toBeInTheDocument();
  });

  it('shows a loading placeholder instead of the list while comments load', () => {
    render(<TareaTraceabilityCard tarea={makeSource()} comments={[]} commentsLoading />);
    expect(screen.getByLabelText('Cargando comentarios')).toBeInTheDocument();
    expect(screen.queryByText('Sin comentarios.')).not.toBeInTheDocument();
  });
});
