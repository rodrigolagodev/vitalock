import { describe, expect, it } from 'vitest';
import { cn } from '../utils';

describe('cn()', () => {
  it('keeps existing tailwind-merge behaviour', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
    expect(cn('p-2', undefined, 'm-1')).toBe('p-2 m-1');
  });

  it('keeps a ladder font size next to a text colour', () => {
    expect(cn('text-foreground', 'text-title-1')).toBe('text-foreground text-title-1');
  });

  it('merges ladder sizes within the font-size group', () => {
    expect(cn('text-title-1', 'text-body')).toBe('text-body');
  });

  it('merges elevation shadows with default shadows', () => {
    expect(cn('shadow-elevation-2', 'shadow-md')).toBe('shadow-md');
    expect(cn('shadow-md', 'shadow-elevation-3')).toBe('shadow-elevation-3');
  });

  it('keeps an elevation shadow next to a shadow colour', () => {
    expect(cn('shadow-elevation-2', 'shadow-primary')).toBe('shadow-elevation-2 shadow-primary');
  });
});
