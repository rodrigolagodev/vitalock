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

  it('dedupes control radius tokens against default radii', () => {
    expect(cn('rounded-control', 'rounded-md')).toBe('rounded-md');
    expect(cn('rounded-md', 'rounded-control')).toBe('rounded-control');
    expect(cn('rounded-container', 'rounded-lg')).toBe('rounded-lg');
  });

  it('dedupes control height and size tokens against default scales', () => {
    expect(cn('h-control-md', 'h-9')).toBe('h-9');
    expect(cn('size-control-md', 'size-8')).toBe('size-8');
    expect(cn('h-9', 'h-control-lg')).toBe('h-control-lg');
  });

  it('dedupes safe-area and tab-bar spacing tokens against default spacing', () => {
    expect(cn('pb-4', 'pb-safe-b')).toBe('pb-safe-b');
    expect(cn('pb-safe-b', 'pb-2')).toBe('pb-2');
    expect(cn('pt-4', 'pt-safe-t')).toBe('pt-safe-t');
    expect(cn('h-9', 'h-tab-bar')).toBe('h-tab-bar');
  });

  it('keeps safe-area tokens on different sides and axes', () => {
    expect(cn('pt-safe-t', 'pb-safe-b')).toBe('pt-safe-t pb-safe-b');
    expect(cn('pb-safe-b', 'px-4')).toBe('pb-safe-b px-4');
  });
});
