import { describe, expect, it } from 'vitest';
import { lineSubtotal, orderTotal } from './orderTotals';

describe('lineSubtotal', () => {
  it('multiplies quantity by unit price', () => {
    expect(lineSubtotal({ quantity: 2, unit_price: 50.5 })).toBe(101);
    expect(lineSubtotal({ quantity: 3, unit_price: 10 })).toBe(30);
  });

  it('ignores status: a cancelled row still returns its own subtotal', () => {
    expect(lineSubtotal({ quantity: 1, unit_price: 40, status: 'cancelled' })).toBe(40);
  });

  it('treats a null or undefined price as 0', () => {
    expect(lineSubtotal({ quantity: 2, unit_price: null })).toBe(0);
    expect(lineSubtotal({ quantity: 2, unit_price: undefined })).toBe(0);
  });

  it('coerces string quantity and price', () => {
    expect(lineSubtotal({ quantity: '2', unit_price: '50.50' })).toBe(101);
  });

  it('returns 0 for a zero-price line', () => {
    expect(lineSubtotal({ quantity: 1, unit_price: 0 })).toBe(0);
  });
});

describe('orderTotal', () => {
  it('sums active items', () => {
    expect(
      orderTotal([
        { quantity: 1, unit_price: 100 },
        { quantity: 2, unit_price: 50.5 },
      ]),
    ).toBe(201);
  });

  it('excludes cancelled items', () => {
    expect(
      orderTotal([
        { quantity: 1, unit_price: 100, status: 'pending' },
        { quantity: 1, unit_price: 40, status: 'cancelled' },
      ]),
    ).toBe(100);
  });

  it('totals 0 for a fully cancelled order', () => {
    expect(
      orderTotal([
        { quantity: 1, unit_price: 100, status: 'cancelled' },
        { quantity: 2, unit_price: 40, status: 'cancelled' },
      ]),
    ).toBe(0);
  });

  it('totals 0 for a zero-price item and for an empty list', () => {
    expect(orderTotal([{ quantity: 1, unit_price: 0 }])).toBe(0);
    expect(orderTotal([])).toBe(0);
  });

  it('counts a null or undefined price as 0 while summing the rest', () => {
    expect(
      orderTotal([
        { quantity: 1, unit_price: null },
        { quantity: 1, unit_price: undefined },
        { quantity: 1, unit_price: 25 },
      ]),
    ).toBe(25);
  });

  it('coerces string quantity and price', () => {
    expect(orderTotal([{ quantity: '3', unit_price: '10.00' }])).toBe(30);
  });

  it('avoids float drift: 3 x 0.10 is exactly 0.30', () => {
    expect(
      orderTotal([
        { quantity: 1, unit_price: 0.1 },
        { quantity: 1, unit_price: 0.1 },
        { quantity: 1, unit_price: 0.1 },
      ]),
    ).toBe(0.3);
  });
});
