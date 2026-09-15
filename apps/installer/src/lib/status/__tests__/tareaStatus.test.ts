import { describe, expect, it } from 'vitest';
import { ArrowLeftRight, ClipboardList, PackagePlus, RefreshCcw, Wrench } from 'lucide-react';
import { categoryIcon, isClosedTareaStatus, ticketClosedAt } from '../tareaStatus';

describe('isClosedTareaStatus', () => {
  it('is true only for terminal statuses', () => {
    expect(isClosedTareaStatus('resolved')).toBe(true);
    expect(isClosedTareaStatus('cancelled')).toBe(true);
    expect(isClosedTareaStatus('open')).toBe(false);
    expect(isClosedTareaStatus('in_progress')).toBe(false);
  });
});

describe('ticketClosedAt', () => {
  it('prefers resolved_at when present', () => {
    expect(
      ticketClosedAt({ resolved_at: '2026-08-20T14:30:00Z', updated_at: '2026-08-21T00:00:00Z' }),
    ).toBe('2026-08-20T14:30:00Z');
  });

  it('falls back to updated_at for cancelled tickets (no resolved_at)', () => {
    expect(ticketClosedAt({ resolved_at: null, updated_at: '2026-08-21T00:00:00Z' })).toBe(
      '2026-08-21T00:00:00Z',
    );
  });
});

describe('categoryIcon', () => {
  it('maps each known category to its own icon', () => {
    expect(categoryIcon('install_equipment')).toBe(PackagePlus);
    expect(categoryIcon('replace_equipment')).toBe(ArrowLeftRight);
    expect(categoryIcon('update_equipment')).toBe(RefreshCcw);
    expect(categoryIcon('maintain_equipment')).toBe(Wrench);
  });

  it('falls back to a generic clipboard icon for an unknown category', () => {
    expect(categoryIcon('unknown_category')).toBe(ClipboardList);
  });
});
