import { describe, it, expect } from 'vitest';
import { usernameSchema, USERNAME_PATTERN } from './username';

// USERNAME_PATTERN is the raw regex the DB CHECK constraint mirrors exactly
// (no normalization) — it must reject anything outside [a-z0-9._-]{3,32}.
describe('USERNAME_PATTERN', () => {
  it('matches a well-formed lowercase username', () => {
    expect(USERNAME_PATTERN.test('juan.perez')).toBe(true);
  });

  it('rejects uppercase characters', () => {
    expect(USERNAME_PATTERN.test('Juan.Perez')).toBe(false);
  });

  it('rejects a space', () => {
    expect(USERNAME_PATTERN.test('juan perez')).toBe(false);
  });

  it('rejects an @', () => {
    expect(USERNAME_PATTERN.test('juan@perez')).toBe(false);
  });

  it('rejects a 2-character value', () => {
    expect(USERNAME_PATTERN.test('ab')).toBe(false);
  });

  it('rejects a 33-character value', () => {
    expect(USERNAME_PATTERN.test('a'.repeat(33))).toBe(false);
  });
});

// usernameSchema normalizes (trim + lowercase) before validating, so the
// login/admin forms never reject a merely differently-cased or padded input.
describe('usernameSchema', () => {
  it('accepts a well-formed lowercase username unchanged', () => {
    const result = usernameSchema.safeParse('juan.perez');
    expect(result.success).toBe(true);
    expect(result.success && result.data).toBe('juan.perez');
  });

  it('normalizes case and surrounding whitespace on parse', () => {
    const result = usernameSchema.safeParse('  Juan.Perez  ');
    expect(result.success).toBe(true);
    expect(result.success && result.data).toBe('juan.perez');
  });

  it('rejects a value that still contains a space after normalization', () => {
    expect(usernameSchema.safeParse('juan perez').success).toBe(false);
  });

  it('rejects a value that still contains an @ after normalization', () => {
    expect(usernameSchema.safeParse('juan@perez').success).toBe(false);
  });

  it('rejects a 2-character value after trimming', () => {
    expect(usernameSchema.safeParse('  ab  ').success).toBe(false);
  });

  it('rejects a 33-character value', () => {
    expect(usernameSchema.safeParse('a'.repeat(33)).success).toBe(false);
  });
});
