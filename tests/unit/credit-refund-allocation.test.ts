import { describe, it, expect } from "vitest";
import { allocateCumulativeRefund } from "@/domain/store-credit/refund-allocation";
import { computeOrderFinancialProjection } from "@/domain/financial-projection/projection";
describe("store credit funding and refunds", () => {
  it("keeps purchase revenue intact and distinguishes external receipts from credit", () => {
    const result = computeOrderFinancialProjection({
      purchaseTotalCents: 10000,
      committedCreditCents: 3000,
      isConfirmed: false,
      isCancelled: false,
      receipts: [{ id: "bank", originalAmountCents: 7000 }],
    });
    expect(result.purchaseTotalCents).toBe(10000);
    expect(result.totalReceivedCents).toBe(7000);
    expect(result.isFullyFunded).toBe(true);
    expect(result.orderWideExcessCapacityCents).toBe(0);
  });
  it("splits a half refund across original sources", () => {
    expect(
      allocateCumulativeRefund(5000, [
        { id: "credit", fundedCents: 3000 },
        { id: "bank", fundedCents: 7000 },
      ]),
    ).toEqual(
      new Map([
        ["credit", 1500],
        ["bank", 3500],
      ]),
    );
  });
  it("keeps cumulative allocations monotonic, exact and capped with awkward integer ratios", () => {
    for (const weights of [
      [1, 1, 1],
      [6, 4, 2],
      [5, 3, 1],
      [11, 7, 3, 1],
    ]) {
      const sources = weights.map((fundedCents, i) => ({
        id: String(i),
        fundedCents,
      }));
      let previous = new Map(sources.map((s) => [s.id, 0]));
      for (
        let total = 0;
        total <= weights.reduce((a, b) => a + b, 0);
        total++
      ) {
        const current = allocateCumulativeRefund(total, sources);
        expect([...current.values()].reduce((a, b) => a + b, 0)).toBe(total);
        for (const source of sources) {
          expect(current.get(source.id)!).toBeGreaterThanOrEqual(
            previous.get(source.id)!,
          );
          expect(current.get(source.id)!).toBeLessThanOrEqual(
            source.fundedCents,
          );
        }
        previous = current;
      }
    }
  });
  it("uses exact arithmetic at supported money limits", () => {
    const sources = [
      { id: "a", fundedCents: 1000000000 },
      { id: "b", fundedCents: 1147483647 },
    ];
    expect(allocateCumulativeRefund(2147483647, sources)).toEqual(
      new Map(sources.map((s) => [s.id, s.fundedCents])),
    );
    expect(() => allocateCumulativeRefund(2147483648, sources)).toThrow(
      "exceeds",
    );
  });
});
