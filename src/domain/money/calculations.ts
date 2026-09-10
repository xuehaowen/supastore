/**
 * Pure integer minor-unit arithmetic and calculations for SupaStore.
 * All amounts are integer minor units (e.g., cents) unless explicitly identified.
 * No binary floating-point calculations for currency totals.
 */

export interface LineItemInput {
  unitPriceCents: number;
  quantity: number;
  taxRateBasisPoints?: number; // e.g., 2000 for 20.00%
  isTaxInclusive?: boolean;
}

export interface ShippingInput {
  amountCents: number;
  taxRateBasisPoints?: number;
  isTaxInclusive?: boolean;
}

export interface LineItemCalculation {
  unitPriceCents: number;
  quantity: number;
  subtotalCents: number;
  taxCents: number;
  isTaxInclusive: boolean;
}

export interface ShippingCalculation {
  amountCents: number;
  taxCents: number;
  isTaxInclusive: boolean;
}

export interface PurchaseCalculationResult {
  merchandiseSubtotalCents: number;
  shippingCents: number;
  exclusiveTaxCents: number;
  inclusiveTaxCents: number;
  totalPayableCents: number; // P = merchandise + shipping + exclusive tax
  lineItems: LineItemCalculation[];
  shipping: ShippingCalculation;
}

/**
 * Enforce integer bounds and nonnegative values.
 */
export const MAX_SAFE_QUANTITY = 10_000;
export const MAX_SAFE_AMOUNT_CENTS = 1_000_000_000; // 10 million dollars

export function assertValidQuantity(quantity: number): void {
  if (!Number.isInteger(quantity) || quantity <= 0 || quantity > MAX_SAFE_QUANTITY) {
    throw new Error(`Invalid quantity: ${quantity}. Must be an integer between 1 and ${MAX_SAFE_QUANTITY}.`);
  }
}

export function assertNonNegativeCents(amountCents: number, fieldName = 'Amount'): void {
  if (!Number.isInteger(amountCents) || amountCents < 0 || amountCents > MAX_SAFE_AMOUNT_CENTS) {
    throw new Error(`${fieldName} must be a non-negative integer minor unit under ${MAX_SAFE_AMOUNT_CENTS}. Received: ${amountCents}`);
  }
}

/**
 * Exact half-up rounding for minor unit calculation.
 * Computes (numerator / denominator) rounded half-up to nearest integer.
 */
export function roundHalfUp(numerator: bigint, denominator: bigint): number {
  if (denominator === 0n) {
    throw new Error('Division by zero in roundHalfUp');
  }

  const isNegative = (numerator < 0n) !== (denominator < 0n);
  const absNum = numerator < 0n ? -numerator : numerator;
  const absDen = denominator < 0n ? -denominator : denominator;

  // For half-up: add absDen / 2 before integer division
  // absNum * 2 + absDen / (2 * absDen)
  const remainder = absNum % absDen;
  const quotient = absNum / absDen;

  let rounded = quotient;
  if (remainder * 2n >= absDen) {
    rounded += 1n;
  }

  const result = isNegative ? -rounded : rounded;
  return Number(result);
}

/**
 * Calculate tax for an exclusive amount with basis points (1 bp = 0.01%, 10,000 bp = 100%).
 */
export function calculateExclusiveTaxCents(amountCents: number, rateBasisPoints: number): number {
  assertNonNegativeCents(amountCents, 'Amount for exclusive tax');
  if (rateBasisPoints <= 0) return 0;

  const num = BigInt(amountCents) * BigInt(rateBasisPoints);
  const den = 10_000n;
  return roundHalfUp(num, den);
}

/**
 * Extract tax from an inclusive amount with basis points.
 * T_inclusive = roundHalfUp(Amount * rate / (1 + rate)) = roundHalfUp(Amount * bps / (10000 + bps))
 */
export function calculateInclusiveTaxCents(amountCents: number, rateBasisPoints: number): number {
  assertNonNegativeCents(amountCents, 'Amount for inclusive tax');
  if (rateBasisPoints <= 0) return 0;

  const num = BigInt(amountCents) * BigInt(rateBasisPoints);
  const den = 10_000n + BigInt(rateBasisPoints);
  return roundHalfUp(num, den);
}

/**
 * Calculate purchase quote snapshot.
 */
export function calculatePurchaseTotal(
  items: LineItemInput[],
  shipping: ShippingInput = { amountCents: 0, taxRateBasisPoints: 0, isTaxInclusive: false }
): PurchaseCalculationResult {
  let merchandiseSubtotalCents = 0;
  let exclusiveTaxCents = 0;
  let inclusiveTaxCents = 0;

  const calculatedItems: LineItemCalculation[] = items.map((item) => {
    assertValidQuantity(item.quantity);
    assertNonNegativeCents(item.unitPriceCents, 'Unit price');

    const subtotalCents = item.unitPriceCents * item.quantity;
    assertNonNegativeCents(subtotalCents, 'Line subtotal');

    const rateBps = item.taxRateBasisPoints ?? 0;
    const isInclusive = item.isTaxInclusive ?? false;

    let taxCents = 0;
    if (rateBps > 0) {
      if (isInclusive) {
        taxCents = calculateInclusiveTaxCents(subtotalCents, rateBps);
        inclusiveTaxCents += taxCents;
      } else {
        taxCents = calculateExclusiveTaxCents(subtotalCents, rateBps);
        exclusiveTaxCents += taxCents;
      }
    }

    merchandiseSubtotalCents += subtotalCents;

    return {
      unitPriceCents: item.unitPriceCents,
      quantity: item.quantity,
      subtotalCents,
      taxCents,
      isTaxInclusive: isInclusive,
    };
  });

  assertNonNegativeCents(shipping.amountCents, 'Shipping amount');
  const shippingRateBps = shipping.taxRateBasisPoints ?? 0;
  const shippingIsInclusive = shipping.isTaxInclusive ?? false;

  let shippingTaxCents = 0;
  if (shippingRateBps > 0) {
    if (shippingIsInclusive) {
      shippingTaxCents = calculateInclusiveTaxCents(shipping.amountCents, shippingRateBps);
      inclusiveTaxCents += shippingTaxCents;
    } else {
      shippingTaxCents = calculateExclusiveTaxCents(shipping.amountCents, shippingRateBps);
      exclusiveTaxCents += shippingTaxCents;
    }
  }

  const calculatedShipping: ShippingCalculation = {
    amountCents: shipping.amountCents,
    taxCents: shippingTaxCents,
    isTaxInclusive: shippingIsInclusive,
  };

  const totalPayableCents = merchandiseSubtotalCents + shipping.amountCents + exclusiveTaxCents;

  assertNonNegativeCents(totalPayableCents, 'Total payable P');

  return {
    merchandiseSubtotalCents,
    shippingCents: shipping.amountCents,
    exclusiveTaxCents,
    inclusiveTaxCents,
    totalPayableCents,
    lineItems: calculatedItems,
    shipping: calculatedShipping,
  };
}
