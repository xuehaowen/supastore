import { beforeEach, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";
const mocks = vi.hoisted(() => ({ transaction: vi.fn(), insert: vi.fn() }));
vi.mock("@/infrastructure/db", () => ({
  db: { transaction: mocks.transaction },
}));
vi.mock("@/infrastructure/auth/session", () => ({
  verifyStaffInTransaction: async () => ({ userId: "owner", role: "owner" }),
}));
import { authorizeRefund } from "@/application/use-cases/refund-payout";
let lifecycle: string, receiptOrder: string;
beforeEach(() => {
  vi.clearAllMocks();
  lifecycle = "confirmed";
  receiptOrder = "order";
  const tx = {
    execute: async () => [],
    select: () => ({
      from: (table: Parameters<typeof getTableName>[0]) => {
        const name = getTableName(table);
        const rows =
          name === "orders"
            ? [
                {
                  id: "order",
                  lifecycleStatus: lifecycle,
                  purchaseTotalCents: 1000,
                },
              ]
            : name === "payment_receipts"
              ? [{ id: "receipt", orderId: receiptOrder, amountCents: 1000 }]
              : [];
        const chain: any = {
          where: () => chain,
          limit: async () => rows,
          then: (resolve: (rows: unknown[]) => void) =>
            Promise.resolve(rows).then(resolve),
        };
        return chain;
      },
    }),
    insert: (table: Parameters<typeof getTableName>[0]) => ({
      values: (value: unknown) => {
        mocks.insert(getTableName(table), value);
        return { returning: async () => [{ id: "authorization" }] };
      },
    }),
  };
  mocks.transaction.mockImplementation(async (work) => work(tx));
});
const request = () =>
  authorizeRefund({
    orderId: "order",
    receiptId: "receipt",
    amountCents: 100,
    ownerUserId: "owner",
    reason: "Purchase refund",
  });
it.each(["unpaid", "cancelled"])(
  "rejects purchase refunds on %s orders",
  async (status) => {
    lifecycle = status;
    await expect(request()).rejects.toThrow(/confirm|cancel|purchase/i);
    expect(mocks.insert).not.toHaveBeenCalled();
  },
);
it("rejects another order's receipt", async () => {
  receiptOrder = "other";
  await expect(request()).rejects.toThrow(/receipt|order/i);
  expect(mocks.insert).not.toHaveBeenCalled();
});
it.each(["confirmed", "completed"])(
  "allows purchased-item refunds for %s orders",
  async (status) => {
    lifecycle = status;
    await expect(request()).resolves.toMatchObject({ amountCents: 100 });
  },
);
