import { describe, expect, it } from 'vitest';
import { definedRpcArgs } from '../rpc';

describe('definedRpcArgs', () => {
  it('drops null entries so the SQL DEFAULT applies', () => {
    expect(definedRpcArgs({ p_note: null, p_actor_staff_id: 'staff-1' })).toEqual({
      p_actor_staff_id: 'staff-1',
    });
  });

  it('drops undefined entries', () => {
    expect(definedRpcArgs({ p_note: undefined, p_unit_id: 'unit-1' })).toEqual({
      p_unit_id: 'unit-1',
    });
  });

  it('keeps falsy-but-defined values — empty string, zero, false are real inputs', () => {
    expect(definedRpcArgs({ p_note: '', p_qty: 0, p_flag: false })).toEqual({
      p_note: '',
      p_qty: 0,
      p_flag: false,
    });
  });

  it('returns an empty object when every entry is nullish', () => {
    expect(definedRpcArgs({ a: null, b: undefined })).toEqual({});
  });

  it('does not mutate its input', () => {
    const input = { p_note: null, p_id: 'x' };
    definedRpcArgs(input);
    expect(input).toEqual({ p_note: null, p_id: 'x' });
  });
});
