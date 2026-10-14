import { describe, expect, it } from "vitest";
import {
  accountView,
  cartView,
  orderView,
} from "../../apps/backend/src/infrastructure/http/customer-page-view";
describe("customer page response projection", () => {
  it("keeps customer credit totals and activity without staff identifiers or ledger keys", () => {
    const account = {
      customer: {
        name: "Customer",
        email: "customer@example.test",
        phone: null,
        authUserId: "private-auth",
      },
      addresses: [],
      orders: [],
      hasNext: false,
      credit: {
        account: {
          currency: "USD",
          precision: 2,
          balanceCents: 500,
          reservedCents: 100,
          customerId: "private-customer",
        },
        reconciled: true,
        hasNext: false,
        entries: [
          {
            id: "entry",
            amountCents: 500,
            reason: "grant",
            createdAt: new Date("2026-01-01"),
            actorId: "private-staff",
            requestKey: "private-key",
            payloadHash: "private-hash",
          },
        ],
      },
    };
    const output = accountView(
      account as unknown as Parameters<typeof accountView>[0],
    );
    expect(output.credit?.account).toEqual({
      currency: "USD",
      precision: 2,
      balanceCents: 500,
      reservedCents: 100,
    });
    expect(output.credit?.entries[0]?.reason).toBe("grant");
    expect(JSON.stringify(output)).not.toContain("private-");
  });
  it("keeps historical item names and return quantities without staff handoff and stock disposition", () => {
    const result = {
      order: {
        referenceCode: "SP-DEMO",
        lifecycleStatus: "completed",
        purchaseTotalCents: 1000,
        creditAppliedCents: 0,
        termsSnapshot: { currency: "USD", precision: 2 },
        customerId: "customer",
      },
      items: [
        {
          id: "item",
          variantId: "variant",
          quantity: 2,
          unitPriceCents: 500,
          catalogSnapshot: {},
        },
      ],
      quoteItems: [{ variantId: "variant", title: "Historical cup" }],
      receivedCents: 1000,
      refunds: [],
      evidence: [],
      fulfillment: { status: "fulfilled", handoffActor: "private-staff" },
      proposal: {
        id: "proposal",
        reason: "Updated price",
        proposedTotalCents: 1100,
        actorId: "private-staff",
      },
      goodsReturns: [
        {
          id: "return",
          status: "received",
          reason: "Return",
          reviewReason: null,
          requestKey: "private-key",
        },
      ],
      returnItems: [
        {
          returnId: "return",
          orderItemId: "item",
          quantity: 1,
          restockedQuantity: 1,
          damagedQuantity: 0,
        },
      ],
    };
    const output = orderView(
      result as unknown as Parameters<typeof orderView>[0],
    );
    expect(output.items[0]?.catalogSnapshot.title).toBe("Historical cup");
    expect(output.order.isClaimed).toBe(true);
    expect(output.returnItems).toEqual([
      { returnId: "return", orderItemId: "item", quantity: 1 },
    ]);
    expect(JSON.stringify(output)).not.toMatch(
      /private-|restockedQuantity|damagedQuantity/,
    );
  });
  it("does not expose the cart session hash", () => {
    expect(
      cartView({
        id: "cart",
        guestSessionId: "private-session",
        revision: 1,
        items: [],
        subtotalCents: 0,
        itemCount: 0,
      }),
    ).toEqual({
      id: "cart",
      revision: 1,
      items: [],
      subtotalCents: 0,
      itemCount: 0,
    });
  });
});
