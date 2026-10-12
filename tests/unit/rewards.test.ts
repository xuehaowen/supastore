import { describe, expect, it } from "vitest";
import {
  allocateRewardFunding,
  createRewardSnapshot,
  calculateRewardRefundTarget,
  calculateRewardRevocation,
  recoverRewardDebt,
  recoverRevokedCreditRestore,
  allocateCreditLots,
  accumulateRewardComponentRefunds,
  createRewardRefundAccumulator,
  type RewardComponent,
} from "@/domain/rewards";

const merchandise = (
  id: string,
  amount: number,
  eligible = true,
): RewardComponent => ({ id, amount, eligible, type: "merchandise" });
const snapshot = (components: RewardComponent[], externalAmount: number) =>
  createRewardSnapshot({
    policyVersion: "v1",
    customerId: "customer",
    verified: true,
    enabled: true,
    rateBasisPoints: 500,
    components,
    externalAmount,
  });
it("incrementally folds mixed detailed and legacy refunds with original-source caps", () => {
  const accepted = snapshot(
    [
      merchandise("merch", 90),
      { id: "tax", type: "tax", amount: 10, eligible: false },
    ],
    60,
  );
  const refunds = [
    {
      externalCents: 1,
      creditCents: 0,
      componentRefunds: [
        { componentId: "tax", externalCents: 1, creditCents: 0 },
      ],
    },
    { externalCents: 9, creditCents: 6 },
    {
      externalCents: 2,
      creditCents: 3,
      componentRefunds: [
        { componentId: "merch", externalCents: 2, creditCents: 3 },
      ],
    },
  ];
  const fold = createRewardRefundAccumulator(accepted);
  for (const refund of refunds) fold.add(refund);
  expect(fold.value()).toEqual({
    external: { merch: 10, tax: 2 },
    credit: { merch: 8, tax: 1 },
  });
  expect(fold.value()).toEqual(
    accumulateRewardComponentRefunds(accepted, refunds),
  );
  expect(() => fold.add({ externalCents: 100, creditCents: 0 })).toThrow();
  expect(fold.value()).toEqual({
    external: { merch: 10, tax: 2 },
    credit: { merch: 8, tax: 1 },
  });
});

describe("accepted reward funding", () => {
  it.each([
    [[merchandise("a", 4000)], 4000, 4000, 200],
    [[merchandise("a", 4000)], 3000, 3000, 150],
    [
      [
        merchandise("a", 4000),
        { id: "tax", type: "tax", amount: 1000, eligible: false },
      ],
      4000,
      3200,
      160,
    ],
    [[merchandise("a", 2000), merchandise("b", 2000, false)], 2000, 1000, 50],
  ] as [RewardComponent[], number, number, number][])(
    "uses documented funding examples",
    (components, external, basis, reward) => {
      expect(snapshot(components, external)).toMatchObject({
        basis,
        entitlement: reward,
      });
    },
  );
  it("breaks remainder ties by immutable IDs regardless of input order", () => {
    const result = allocateRewardFunding(
      [merchandise("b", 1), merchandise("a", 1)],
      1,
    );
    expect(result.map((item) => item.externalAmount)).toEqual([0, 1]);
    expect(result.reduce((sum, item) => sum + item.creditAmount, 0)).toBe(1);
  });
  it("breaks component type ties explicitly", () => {
    const result = allocateRewardFunding(
      [
        merchandise("a", 1),
        { id: "z", type: "fulfillment", eligible: false, amount: 1 },
      ],
      1,
    );
    expect(result.map((item) => item.externalAmount)).toEqual([0, 1]);
  });
  it("uses exact arithmetic even when intermediate products exceed number precision", () => {
    const amount = Number.MAX_SAFE_INTEGER;
    expect(snapshot([merchandise("a", amount)], amount).entitlement).toBe(
      Number((BigInt(amount) * 500n) / 10000n),
    );
  });
  it.each([1, 100, 1000])(
    "does not assume currency precision (minor-unit scale %i)",
    (scale) => {
      expect(
        snapshot([merchandise("a", 40 * scale)], 40 * scale).entitlement,
      ).toBe(2 * scale);
    },
  );
  it("rounds once across eligible lines", () => {
    expect(
      snapshot([merchandise("a", 10), merchandise("b", 10)], 20).entitlement,
    ).toBe(1);
  });
  it("handles zero payable", () => {
    expect(snapshot([merchandise("a", 0)], 0)).toMatchObject({
      basis: 0,
      entitlement: 0,
    });
  });
  it.each([NaN, Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid minor amounts %s",
    (amount) => {
      expect(() => snapshot([merchandise("a", amount)], 0)).toThrow();
    },
  );
  it("rejects overfunding, duplicate IDs, overflow totals and unsupported rates", () => {
    expect(() => snapshot([merchandise("a", 1)], 2)).toThrow();
    expect(() =>
      snapshot([merchandise("a", 1), merchandise("a", 1)], 1),
    ).toThrow();
    expect(() =>
      snapshot(
        [merchandise("a", Number.MAX_SAFE_INTEGER), merchandise("b", 1)],
        0,
      ),
    ).toThrow();
    expect(() =>
      createRewardSnapshot({
        ...snapshot([], 0),
        components: [],
        externalAmount: 0,
        enabled: true,
        verified: true,
        rateBasisPoints: 10001,
      }),
    ).toThrow();
  });
  it.each([{ enabled: false }, { verified: false }, { customerId: null }])(
    "requires active policy and verified linked identity",
    (override) => {
      expect(
        createRewardSnapshot({
          policyVersion: "v1",
          customerId: "c",
          enabled: true,
          verified: true,
          rateBasisPoints: 500,
          components: [merchandise("a", 4000)],
          externalAmount: 4000,
          ...override,
        }).entitlement,
      ).toBe(0);
    },
  );
});

describe("cumulative refunds and provenance debt", () => {
  it("preserves cent-level earning after a one-cent refund instead of scaling rounded reward", () => {
    const order = snapshot([merchandise("a", 59)], 59);
    expect(order.entitlement).toBe(2);
    expect(calculateRewardRefundTarget(order, { a: 1 }).targetEntitlement).toBe(
      2,
    );
  });
  it("keeps explicit tax-only refunds separate from merchandise through mixed history", () => {
    const order = snapshot(
      [
        merchandise("a", 4000),
        { id: "tax", type: "tax", amount: 1000, eligible: false },
      ],
      4000,
    );
    const refunds = accumulateRewardComponentRefunds(order, [
      {
        externalCents: 800,
        creditCents: 200,
        componentRefunds: [
          { componentId: "tax", externalCents: 800, creditCents: 200 },
        ],
      },
    ]);
    expect(
      calculateRewardRefundTarget(order, refunds.external).targetEntitlement,
    ).toBe(160);
    const remaining = accumulateRewardComponentRefunds(order, [
      {
        externalCents: 800,
        creditCents: 200,
        componentRefunds: [
          { componentId: "tax", externalCents: 800, creditCents: 200 },
        ],
      },
      { externalCents: 800, creditCents: 200 },
    ]);
    expect(remaining.external).toEqual({ a: 800, tax: 800 });
  });
  it("rejects mismatched and duplicated detailed component sources", () => {
    const order = snapshot([merchandise("a", 100)], 100);
    expect(() =>
      accumulateRewardComponentRefunds(order, [
        {
          externalCents: 10,
          creditCents: 0,
          componentRefunds: [
            { componentId: "a", externalCents: 9, creditCents: 0 },
          ],
        },
      ]),
    ).toThrow();
    expect(() =>
      accumulateRewardComponentRefunds(order, [
        {
          externalCents: 102,
          creditCents: 0,
          componentRefunds: [
            { componentId: "a", externalCents: 51, creditCents: 0 },
            { componentId: "a", externalCents: 51, creditCents: 0 },
          ],
        },
      ]),
    ).toThrow();
    expect(() =>
      accumulateRewardComponentRefunds(order, [
        {
          externalCents: 101,
          creditCents: 0,
          componentRefunds: [
            { componentId: "a", externalCents: 101, creditCents: 0 },
          ],
        },
      ]),
    ).toThrow();
  });
  it("active revoked holds recover associated debt only when released", () => {
    expect(calculateRewardRevocation(100, 0)).toEqual({
      revokedAvailable: 0,
      newDebt: 100,
    });
    expect(recoverRevokedCreditRestore(150, 100, 100)).toEqual({
      debtRecovery: 100,
      spendableAmount: 50,
      remainingAssociatedDebt: 0,
    });
  });
  it("restored revoked sources preserve entitlement after later earnings repaid debt", () => {
    expect(recoverRevokedCreditRestore(100, 100, 0)).toEqual({
      debtRecovery: 0,
      spendableAmount: 100,
      remainingAssociatedDebt: 0,
    });
    expect(recoverRevokedCreditRestore(100, 100, 30)).toEqual({
      debtRecovery: 30,
      spendableAmount: 70,
      remainingAssociatedDebt: 0,
    });
  });
  it("does not recover unrelated valid restoration against associated debt", () => {
    expect(recoverRevokedCreditRestore(200, 20, 100)).toEqual({
      debtRecovery: 20,
      spendableAmount: 180,
      remainingAssociatedDebt: 80,
    });
    expect(() => recoverRevokedCreditRestore(20, 21, 100)).toThrow();
  });
  it("holds reward lots before other sources and FIFO within each source group", () => {
    const date = "2026-10-01T00:00:00Z";
    const lots = [
      {
        id: "merchant",
        sourceKind: "merchant" as const,
        createdAt: "2020-01-01T00:00:00Z",
        availableAmount: 100,
      },
      {
        id: "b",
        sourceKind: "reward" as const,
        createdAt: date,
        availableAmount: 20,
      },
      {
        id: "a",
        sourceKind: "reward" as const,
        createdAt: date,
        availableAmount: 30,
      },
    ];
    expect(allocateCreditLots(lots, 60)).toEqual([
      { lotId: "a", amount: 30 },
      { lotId: "b", amount: 20 },
      { lotId: "merchant", amount: 10 },
    ]);
    expect(() => allocateCreditLots(lots, 151)).toThrow();
  });
  it("reverses cumulatively and makes repeated events zero", () => {
    const order = snapshot([merchandise("a", 4000)], 4000);
    expect(calculateRewardRefundTarget(order, { a: 1000 })).toMatchObject({
      targetEntitlement: 150,
      incrementalReversal: 50,
    });
    expect(calculateRewardRefundTarget(order, { a: 2000 }, 50)).toMatchObject({
      targetEntitlement: 100,
      incrementalReversal: 50,
    });
    expect(
      calculateRewardRefundTarget(order, { a: 2000 }, 100).incrementalReversal,
    ).toBe(0);
  });
  it("tax-only refunds leave merchandise entitlement intact", () => {
    const order = snapshot(
      [
        merchandise("a", 4000),
        { id: "tax", type: "tax", amount: 1000, eligible: false },
      ],
      4000,
    );
    expect(
      calculateRewardRefundTarget(order, { tax: 800 }).targetEntitlement,
    ).toBe(160);
  });
  it("rejects impossible refunds and tampered snapshots", () => {
    const order = snapshot([merchandise("a", 4000)], 4000);
    expect(() => calculateRewardRefundTarget(order, { a: 4001 })).toThrow();
    expect(() => calculateRewardRefundTarget(order, { unknown: 1 })).toThrow();
    expect(() => calculateRewardRefundTarget(order, {}, 1)).toThrow();
    expect(() =>
      calculateRewardRefundTarget({ ...order, basis: 1 }, {}),
    ).toThrow();
  });
  it("preserves held/consumed credit and repays debt before spendable earnings", () => {
    expect(calculateRewardRevocation(100, 30)).toEqual({
      revokedAvailable: 30,
      newDebt: 70,
    });
    expect(recoverRewardDebt(50, 70)).toEqual({
      debtRecovery: 50,
      spendableAmount: 0,
      remainingDebt: 20,
    });
    expect(recoverRewardDebt(100, 20)).toEqual({
      debtRecovery: 20,
      spendableAmount: 80,
      remainingDebt: 0,
    });
    expect(recoverRewardDebt(30, 0)).toEqual({
      debtRecovery: 0,
      spendableAmount: 30,
      remainingDebt: 0,
    });
  });
});
