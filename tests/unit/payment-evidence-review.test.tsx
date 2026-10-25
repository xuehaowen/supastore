import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

vi.mock("@/app/admin/admin-dialog", () => ({
  AdminDialog: ({ children }: { children: ReactNode }) => (
    <section role="dialog">{children}</section>
  ),
}));
vi.mock("@/app/admin/evidence-image", () => ({
  EvidenceImage: ({ id }: { id: string }) => (
    <img src={`/api/evidence/${id}`} alt="Review evidence" />
  ),
}));
vi.mock("@/app/admin/payment-review", () => ({
  PaymentReview: ({ receiptSummary }: { receiptSummary: ReactNode }) => (
    <div>
      {receiptSummary}
      <button>Record receipt</button>
    </div>
  ),
}));
vi.mock("@/infrastructure/web", () => ({
  money: (amount: number, currency: string, precision: number) =>
    `${currency} ${(amount / 10 ** precision).toFixed(precision)}`,
}));

import { PaymentsView } from "@/app/admin/payments-view";
import type { OperationsScreenProps } from "@/app/admin/operations-types";

it("shows separate payment and order statuses, linked order numbers, and copy controls", () => {
  const props = {
    view: "payments",
    query: {},
    returnTo: "/admin/payments",
    filters: { paymentSearch: "ORD000123", paymentPage: 1, evidencePage: 1 },
    data: {
      store: { currency: "USD", precision: 2, timezone: "UTC" },
      evidence: [],
      evidenceHasNext: false,
      paymentRows: [
        {
          receipt: {
            id: "payment-one",
            referenceCode: "PAY-000123",
            rawReference: "BANK-ABC",
            amountCents: 40,
            createdAt: new Date("2026-10-01"),
          },
          order: {
            id: "order-one",
            referenceCode: "ORD-000123",
            guestName: "Buyer",
            guestEmail: "buyer@example.test",
            lifecycleStatus: "unpaid",
            fulfillmentType: "pickup",
            purchaseTotalCents: 100,
            creditAppliedCents: 0,
          },
          account: { accountType: "venmo", accountName: "Venmo" },
          paymentState: "partially_paid",
        },
      ],
    },
  } as unknown as OperationsScreenProps;
  const html = renderToStaticMarkup(createElement(PaymentsView, props));
  expect(html).toContain("Order status");
  expect(html).toContain("Order payment status");
  expect(html).toContain("Partially paid");
  expect(html).toContain(">unpaid<");
  expect(html).toContain('href="/admin/orders/order-one"');
  expect(html).toContain('aria-label="Copy ORD-000123"');
  expect(html).toContain('aria-label="Copy PAY-000123"');
  expect(html).not.toContain("Previously");
});

it("shows only the reviewed order's items together with evidence, totals, fulfillment, and receipts", () => {
  const props = {
    view: "payments",
    query: { reviewEvidence: "proof-one" },
    returnTo: "/admin/payments",
    filters: { paymentPage: 1, evidencePage: 1 },
    data: {
      paymentRows: [],
      evidenceHasNext: false,
      accounts: [],
      store: { currency: "USD", precision: 2, timezone: "UTC" },
      evidence: [
        {
          id: "proof-one",
          order: {
            id: "order-one",
            referenceCode: "ORD-000001",
            guestName: "Buyer One",
            guestEmail: "buyer@example.test",
            lifecycleStatus: "unpaid",
            createdAt: new Date("2026-10-01T12:00:00Z"),
            termsSnapshot: { currency: "KWD", precision: 3 },
            purchaseTotalCents: 12500,
            creditAppliedCents: 2500,
            fulfillmentType: "pickup",
            pickupLocationName: "Main shop",
            pickupTime: "2026-10-25 10:00",
            shippingAddressSnapshot: {},
          },
        },
      ],
      evidenceOrderItems: [
        {
          id: "line-one",
          orderId: "order-one",
          name: "Original cup",
          catalogSnapshot: { sku: "CUP-01" },
          quantity: 2,
          unitPriceCents: 6250,
          lineTotalCents: 12500,
        },
        {
          id: "line-other",
          orderId: "order-other",
          name: "Other buyer item",
          catalogSnapshot: {},
          quantity: 1,
          unitPriceCents: 100,
          lineTotalCents: 100,
        },
      ],
      evidenceReceipts: [
        {
          id: "receipt-one",
          referenceCode: "PAY-000123",
          orderId: "order-one",
          rawReference: "TRANSFER-ONE",
          amountCents: 10000,
        },
        {
          id: "receipt-other",
          referenceCode: "PAY-000124",
          orderId: "order-other",
          rawReference: "OTHER-TRANSFER",
          amountCents: 100,
        },
      ],
    },
  } as unknown as OperationsScreenProps;
  const html = renderToStaticMarkup(createElement(PaymentsView, props));
  const dialog = html.slice(html.indexOf('<section role="dialog">'));
  for (const text of [
    "/api/evidence/proof-one",
    "Order details · ORD-000001",
    "Buyer One",
    "buyer@example.test",
    "Original cup",
    "CUP-01",
    "Quantity",
    "KWD 6.250",
    "KWD 12.500",
    "KWD 2.500",
    "External payment total:",
    "KWD 10.000",
    "Main shop",
    "2026-10-25 10:00",
    "TRANSFER-ONE",
    "PAY-000123",
    "Transaction reference:",
    "Record receipt",
  ])
    expect(dialog).toContain(text);
  expect(dialog).not.toContain("Other buyer item");
  expect(dialog).not.toContain("OTHER-TRANSFER");
  expect(dialog).not.toContain("PAY-000124");
});
