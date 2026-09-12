import { describe, expect, it } from 'vitest';
import {
  buildTareaTimeline,
  isTerminalTareaStatus,
  tareaClosedAt,
  type TareaTimelineSource,
} from '../tareaTimeline';

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

describe('isTerminalTareaStatus', () => {
  it('is true only for resolved and cancelled', () => {
    expect(isTerminalTareaStatus('resolved')).toBe(true);
    expect(isTerminalTareaStatus('cancelled')).toBe(true);
    expect(isTerminalTareaStatus('open')).toBe(false);
    expect(isTerminalTareaStatus('in_progress')).toBe(false);
  });
});

describe('tareaClosedAt', () => {
  it('returns null while the ticket is active', () => {
    expect(tareaClosedAt(makeSource({ status: 'in_progress' }))).toBeNull();
  });

  it('uses resolved_at for resolved tickets', () => {
    expect(
      tareaClosedAt(
        makeSource({
          status: 'resolved',
          resolved_at: '2026-09-03T16:45:00Z',
          updated_at: '2026-09-03T17:00:00Z',
        }),
      ),
    ).toBe('2026-09-03T16:45:00Z');
  });

  it('falls back to updated_at for cancelled tickets', () => {
    expect(
      tareaClosedAt(makeSource({ status: 'cancelled', updated_at: '2026-09-04T09:00:00Z' })),
    ).toBe('2026-09-04T09:00:00Z');
  });
});

describe('buildTareaTimeline', () => {
  it('starts with the opening step only for an unassigned open ticket', () => {
    const timeline = buildTareaTimeline(makeSource());
    expect(timeline.map((e) => e.key)).toEqual(['opened']);
    expect(timeline[0]).toMatchObject({
      label: 'Abierta',
      at: '2026-09-01T10:00:00Z',
      actor: 'Ana Gómez',
      tone: 'neutral',
    });
  });

  it('adds the assignment step when the ticket has an assignee', () => {
    const timeline = buildTareaTimeline(makeSource({ assigned_to_name: 'Pablo Ruiz' }));
    expect(timeline.map((e) => e.key)).toEqual(['opened', 'assigned']);
    expect(timeline[1]).toMatchObject({ label: 'Asignada a', actor: 'Pablo Ruiz', at: null });
  });

  it('ends with a resolved step carrying actor, date and notes', () => {
    const timeline = buildTareaTimeline(
      makeSource({
        status: 'resolved',
        assigned_to_name: 'Pablo Ruiz',
        resolved_at: '2026-09-03T16:45:00Z',
        resolved_by_name: 'Pablo Ruiz',
        resolution_notes: 'Cilindro reemplazado.',
      }),
    );
    expect(timeline.map((e) => e.key)).toEqual(['opened', 'assigned', 'resolved']);
    expect(timeline[2]).toMatchObject({
      label: 'Finalizada',
      at: '2026-09-03T16:45:00Z',
      actor: 'Pablo Ruiz',
      detail: 'Cilindro reemplazado.',
      tone: 'success',
    });
  });

  it('ends with a cancelled step dated by updated_at and treats blank reasons as absent', () => {
    const timeline = buildTareaTimeline(
      makeSource({
        status: 'cancelled',
        updated_at: '2026-09-04T09:00:00Z',
        cancellation_reason: '   ',
      }),
    );
    expect(timeline.at(-1)).toMatchObject({
      key: 'cancelled',
      label: 'Cancelada',
      at: '2026-09-04T09:00:00Z',
      detail: null,
      tone: 'danger',
    });
  });
});
