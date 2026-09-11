import { describe, expect, it } from 'vitest';
import {
  isJsonObject,
  readJsonString,
  readJsonStringArray,
  requireJsonObject,
  requireJsonString,
} from '../json';

describe('isJsonObject', () => {
  it('accepts plain objects', () => {
    expect(isJsonObject({ a: 1 })).toBe(true);
    expect(isJsonObject({})).toBe(true);
  });

  it('rejects null, arrays and scalars', () => {
    expect(isJsonObject(null)).toBe(false);
    expect(isJsonObject(undefined)).toBe(false);
    expect(isJsonObject([1, 2])).toBe(false);
    expect(isJsonObject('str')).toBe(false);
    expect(isJsonObject(42)).toBe(false);
    expect(isJsonObject(true)).toBe(false);
  });
});

describe('requireJsonObject', () => {
  it('returns the object unchanged when valid', () => {
    const payload = { ticket_id: 't-1' };
    expect(requireJsonObject(payload, 'some_rpc')).toBe(payload);
  });

  it('throws a TypeError naming the RPC on a non-object payload', () => {
    expect(() => requireJsonObject(null, 'resolve_equipment_update')).toThrow(TypeError);
    expect(() => requireJsonObject(['x'], 'resolve_equipment_update')).toThrow(
      /resolve_equipment_update returned a non-object JSON payload/,
    );
  });
});

describe('readJsonString', () => {
  it('reads a string value', () => {
    expect(readJsonString({ id: 'abc' }, 'id')).toBe('abc');
  });

  it('returns null for a missing key or a non-string value', () => {
    expect(readJsonString({}, 'id')).toBeNull();
    expect(readJsonString({ id: 7 }, 'id')).toBeNull();
    expect(readJsonString({ id: null }, 'id')).toBeNull();
  });
});

describe('requireJsonString', () => {
  it('returns the string when present', () => {
    expect(requireJsonString({ ticket_id: 't-9' }, 'ticket_id', 'rpc_x')).toBe('t-9');
  });

  it('throws a TypeError naming the RPC and the key when missing', () => {
    expect(() => requireJsonString({}, 'ticket_id', 'rpc_x')).toThrow(
      /rpc_x returned no string "ticket_id" in its JSON payload/,
    );
  });

  it('throws when the value has the wrong type', () => {
    expect(() => requireJsonString({ ticket_id: 12 }, 'ticket_id', 'rpc_x')).toThrow(TypeError);
  });
});

describe('readJsonStringArray', () => {
  it('returns the string entries of an array', () => {
    expect(readJsonStringArray({ ids: ['a', 'b'] }, 'ids')).toEqual(['a', 'b']);
  });

  it('filters out non-string entries instead of throwing', () => {
    expect(readJsonStringArray({ ids: ['a', 1, null, 'b', {}] }, 'ids')).toEqual(['a', 'b']);
  });

  it('returns an empty array for a missing key or a non-array value', () => {
    expect(readJsonStringArray({}, 'ids')).toEqual([]);
    expect(readJsonStringArray({ ids: 'a' }, 'ids')).toEqual([]);
    expect(readJsonStringArray({ ids: null }, 'ids')).toEqual([]);
  });
});
