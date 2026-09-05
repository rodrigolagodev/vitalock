import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { createStatusHelpers } from '@vitalock/ui';

type TestStatus = 'open' | 'done' | 'cancelled';

const testStatus = createStatusHelpers<TestStatus>({
  open: { label: 'Abierto', tone: 'info' },
  done: { label: 'Hecho', tone: 'success' },
  cancelled: { label: 'Cancelado', tone: 'danger' },
});

describe('createStatusHelpers', () => {
  describe('label', () => {
    it('returns meta label for a known status', () => {
      expect(testStatus.label('open')).toBe('Abierto');
      expect(testStatus.label('done')).toBe('Hecho');
    });

    it('returns "—" for null or undefined', () => {
      expect(testStatus.label(null)).toBe('—');
      expect(testStatus.label(undefined)).toBe('—');
    });

    it('returns the raw value when the status is not in meta', () => {
      expect(testStatus.label('unknown_status')).toBe('unknown_status');
    });
  });

  describe('tone', () => {
    it('returns meta tone for a known status', () => {
      expect(testStatus.tone('open')).toBe('info');
      expect(testStatus.tone('cancelled')).toBe('danger');
    });

    it('returns "neutral" for null, undefined, or unknown values', () => {
      expect(testStatus.tone(null)).toBe('neutral');
      expect(testStatus.tone(undefined)).toBe('neutral');
      expect(testStatus.tone('unknown_status')).toBe('neutral');
    });
  });

  describe('Badge', () => {
    it('renders the label from meta', () => {
      render(<testStatus.Badge status="open" />);
      expect(screen.getByText('Abierto')).toBeInTheDocument();
    });

    it('applies the tone from meta as the badge className', () => {
      const { container } = render(<testStatus.Badge status="cancelled" />);
      const badge = container.querySelector('[class*="rounded-full"]');
      expect(badge).not.toBeNull();
      expect(badge!.className).toContain('bg-destructive/10');
    });
  });

  it('exposes the raw meta table for callers that need it', () => {
    expect(testStatus.meta.open.label).toBe('Abierto');
    expect(testStatus.meta.done.tone).toBe('success');
  });
});
