import { describe, expect, it } from 'vitest';
import { ACTIVE_STATUS, LOW_STOCK_THRESHOLD } from '../statThresholds';

describe('stat thresholds', () => {
  it('flags stock at or below 5 as low', () => {
    expect(LOW_STOCK_THRESHOLD).toBe(5);
  });

  it('matches the active administrations status', () => {
    expect(ACTIVE_STATUS).toBe('active');
  });
});
