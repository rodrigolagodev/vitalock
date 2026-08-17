import { describe, expect, it } from 'vitest';
import { escapeIlikeValue } from './escapeIlikeValue';

describe('escapeIlikeValue', () => {
  it('passes through plain text unchanged', () => {
    expect(escapeIlikeValue('garcia')).toBe('garcia');
    expect(escapeIlikeValue('ORD-123')).toBe('ORD-123');
  });

  it('strips PostgREST filter delimiters', () => {
    expect(escapeIlikeValue('foo,bar')).toBe('foobar');
    expect(escapeIlikeValue('a(b)c')).toBe('abc');
    expect(escapeIlikeValue('with "quotes"')).toBe('with quotes');
    expect(escapeIlikeValue('star*here')).toBe('starhere');
  });

  it('escapes SQL LIKE wildcards so they match literally', () => {
    expect(escapeIlikeValue('50%')).toBe('50\\%');
    expect(escapeIlikeValue('a_b')).toBe('a\\_b');
    expect(escapeIlikeValue('back\\slash')).toBe('back\\\\slash');
  });

  it('escapes backslash before other metacharacters (order matters)', () => {
    expect(escapeIlikeValue('\\%')).toBe('\\\\\\%');
  });

  it('handles injection attempts embedding OR clauses', () => {
    const attack = 'x%,name.eq.admin,y%';
    const escaped = escapeIlikeValue(attack);
    expect(escaped).not.toContain(',');
    expect(escaped).not.toContain('(');
    expect(escaped).not.toContain(')');
  });
});
