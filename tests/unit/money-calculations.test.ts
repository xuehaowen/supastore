import { describe, it, expect } from 'vitest';
import {
  calculateExclusiveTaxCents,
  calculateInclusiveTaxCents,
  calculatePurchaseTotal,
  roundHalfUp,
} from '@/domain/money/calculations';

describe('Pure Money Calculations & Integer Rounding', () => {
  it('performs exact round-half-up division', () => {
    expect(roundHalfUp(5n, 2n)).toBe(3); // 2.5 -> 3
    expect(roundHalfUp(4n, 2n)).toBe(2); // 2.0 -> 2
    expect(roundHalfUp(1n, 3n)).toBe(0); // 0.333... -> 0
    expect(roundHalfUp(2n, 3n)).toBe(1); // 0.666... -> 1
    expect(roundHalfUp(150n, 10000n)).toBe(0); // 0.015 -> 0
    expect(roundHalfUp(5000n, 10000n)).toBe(1); // 0.5 -> 1
  });

  it('calculates exclusive tax accurately with basis points', () => {
    // $100.00 at 20% tax (2000 bps) -> $20.00 tax
    expect(calculateExclusiveTaxCents(10000, 2000)).toBe(2000);

    // $19.99 (1999 cents) at 8.25% (825 bps) -> 164.9175 -> 165 cents ($1.65)
    expect(calculateExclusiveTaxCents(1999, 825)).toBe(165);

    // Zero tax rate
    expect(calculateExclusiveTaxCents(5000, 0)).toBe(0);
  });

  it('calculates inclusive tax extraction accurately', () => {
    // $120.00 gross at 20% inclusive (2000 bps) -> 12000 * 2000 / 12000 = 2000 cents
    expect(calculateInclusiveTaxCents(12000, 2000)).toBe(2000);

    // $50.00 gross at 10% inclusive (1000 bps) -> 5000 * 1000 / 11000 = 454.545... -> 455 cents
    expect(calculateInclusiveTaxCents(5000, 1000)).toBe(455);
  });

  it('calculates full purchase total P for multi-item quotes', () => {
    const items = [
      { unitPriceCents: 1500, quantity: 2, taxRateBasisPoints: 1000, isTaxInclusive: false }, // 3000 + 300 tax
      { unitPriceCents: 2000, quantity: 1, taxRateBasisPoints: 0, isTaxInclusive: false },    // 2000 + 0 tax
    ];
    const shipping = { amountCents: 500, taxRateBasisPoints: 1000, isTaxInclusive: false };   // 500 + 50 tax

    const result = calculatePurchaseTotal(items, shipping);

    expect(result.merchandiseSubtotalCents).toBe(5000);
    expect(result.shippingCents).toBe(500);
    expect(result.exclusiveTaxCents).toBe(350); // 300 + 50
    expect(result.totalPayableCents).toBe(5850); // 5000 + 500 + 350
  });

  it('rejects negative or invalid input values', () => {
    expect(() => calculatePurchaseTotal([{ unitPriceCents: -100, quantity: 1 }])).toThrow();
    expect(() => calculatePurchaseTotal([{ unitPriceCents: 100, quantity: 0 }])).toThrow();
    expect(() => calculatePurchaseTotal([{ unitPriceCents: 100, quantity: -5 }])).toThrow();
    expect(() => calculatePurchaseTotal([], { amountCents: -50 })).toThrow();
  });
});
