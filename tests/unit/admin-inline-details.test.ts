import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExpandableTableRowProps } from "@supastore/ui/expandable-table-row";

const fixture = vi.hoisted(() => ({
  expanded: false,
  results: [] as unknown[][],
  verify: vi.fn(),
}));
vi.mock("@supastore/ui/expandable-table-row", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@supastore/ui/expandable-table-row")>();
  return {
    ...original,
    ExpandableTableRow: (props: ExpandableTableRowProps) =>
      createElement(original.ExpandableTableRow, {
        ...props,
        defaultExpanded: fixture.expanded,
      }),
  };
});
vi.mock("@/infrastructure/web", () => ({
  staffIdentity: async () => "owner",
  money: (amount: number, currency = "USD", precision = 2) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: precision,
      maximumFractionDigits: precision,
    }).format(amount / 10 ** precision),
}));
vi.mock("@/app/admin/payment-review", () => ({ PaymentReview: () => null }));
vi.mock("@/app/admin/evidence-image", () => ({ EvidenceImage: () => null }));
vi.mock("@/infrastructure/auth/session", () => ({
  verifyStaffInTransaction: fixture.verify,
}));
vi.mock("@/app/admin/admin-nav", () => ({ AdminNav: () => null }));
vi.mock("@/app/actions", () => ({
  updateStaffMember: vi.fn(),
  removeStaffMember: vi.fn(),
}));
vi.mock("@/infrastructure/db", () => ({
  db: {
    transaction: async (work: (tx: unknown) => Promise<unknown>) =>
      work({
        select: () => {
          const chain = {
            from: () => chain,
            where: () => chain,
            groupBy: () => chain,
            orderBy: () => chain,
            limit: () => chain,
            offset: () => Promise.resolve(fixture.results.shift() ?? []),
          };
          return chain;
        },
      }),
  },
}));

import CustomersPage from "@/app/admin/customers/page";
import { StaffSettings } from "@/app/admin/setup/staff-settings";
import { PaymentsView } from "@/app/admin/payments-view";
import type { OperationsScreenProps } from "@/app/admin/operations-types";

const joined = new Date("2026-09-01T10:00:00Z");
const updated = new Date("2026-10-01T12:00:00Z");
beforeEach(() => {
  fixture.expanded = false;
  fixture.results = [];
  fixture.verify.mockReset();
});

describe("backend inline record details", () => {
  it("expands payment references, receiving account details, and readable order amounts", () => {
    const props = {
      view: "payments",
      query: {},
      returnTo: "/admin/payments",
      filters: {
        paymentSearch: "",
        paymentStatus: "",
        paymentType: "",
        paymentPage: 1,
        evidencePage: 1,
      },
      data: {
        evidence: [],
        evidenceHasNext: false,
        store: { currency: "USD", precision: 2, timezone: "UTC" },
        paymentRows: [
          {
            receipt: {
              id: "receipt-one",
              normalizedReference: "PAY-ONE",
              rawReference: "Original transfer one",
              amountCents: 1250,
              createdAt: joined,
            },
            order: {
              id: "order-one",
              referenceCode: "SP-ONE",
              guestName: "Buyer One",
              guestEmail: "buyer@example.test",
              lifecycleStatus: "confirmed",
              fulfillmentType: "pickup",
              purchaseTotalCents: 2250,
              creditAppliedCents: 1000,
            },
            account: {
              accountName: "Bank one",
              accountIdentifier: "bank@example.test",
              accountType: "zelle",
            },
          },
        ],
      },
    } as unknown as OperationsScreenProps;
    const collapsed = renderToStaticMarkup(createElement(PaymentsView, props));
    expect(collapsed).toContain('aria-label="Show payment PAY-ONE"');
    expect(collapsed).not.toContain("Original transfer one");
    fixture.expanded = true;
    const expanded = renderToStaticMarkup(createElement(PaymentsView, props));
    expect(expanded).toContain("Original transfer one");
    expect(expanded).toContain("bank@example.test");
    expect(expanded).toContain("$22.50");
    expect(expanded).toContain("$10.00");
    expect(expanded).toContain("/admin/orders/order-one");
    expect(expanded).toContain('colSpan="11"');
    expect(expanded).toContain("Manage");
  });
  it("keeps customer phone details collapsed until the row is opened", async () => {
    const profile = {
      id: "customer-one",
      name: "Buyer One",
      email: "buyer@example.test",
      phone: "+15555550123",
      orderCount: 2,
      createdAt: joined,
      updatedAt: updated,
    };
    fixture.results = [[profile]];
    const collapsed = renderToStaticMarkup(
      await CustomersPage({ searchParams: Promise.resolve({}) }),
    );
    expect(collapsed).toContain('aria-label="Show customer Buyer One"');
    expect(collapsed).not.toContain(profile.phone);
    expect(collapsed).toContain("/admin/customers/customer-one");
    fixture.expanded = true;
    fixture.results = [[profile]];
    const expanded = renderToStaticMarkup(
      await CustomersPage({ searchParams: Promise.resolve({}) }),
    );
    expect(expanded).toContain(profile.phone);
    expect(expanded).toContain("Customer since (UTC)");
    expect(expanded).toContain('colSpan="4"');
    expect(fixture.verify).toHaveBeenCalledTimes(2);
  });
  it("shows guest order dates without treating contact summaries as customer accounts", async () => {
    fixture.expanded = true;
    fixture.results = [
      [],
      [
        {
          email: "guest@example.test",
          orderCount: 3,
          firstOrderAt: joined.toISOString(),
          lastOrderAt: updated.toISOString(),
        },
      ],
    ];
    const html = renderToStaticMarkup(
      await CustomersPage({ searchParams: Promise.resolve({ guests: "1" }) }),
    );
    expect(html).toContain(
      'aria-label="Hide guest contact guest@example.test"',
    );
    expect(html).toContain("First order (UTC)");
    expect(html).toContain("Latest order (UTC)");
    expect(html).toContain(
      "Guest contact summaries do not establish account ownership.",
    );
    expect(html).not.toContain("/admin/customers/guest");
  });
  it("keeps the empty customer message spanning every column", async () => {
    fixture.results = [[]];
    const html = renderToStaticMarkup(
      await CustomersPage({ searchParams: Promise.resolve({}) }),
    );
    expect(html).toContain('colSpan="4"');
    expect(html).toContain("No customers match this view.");
  });
  it("shows staff membership dates while keeping access management available", () => {
    fixture.expanded = true;
    const html = renderToStaticMarkup(
      createElement(StaffSettings, {
        members: [
          {
            id: "membership",
            userId: "staff-one",
            email: "staff@example.test",
            role: "staff",
            isActive: true,
            createdAt: joined,
            updatedAt: updated,
          },
        ],
      }),
    );
    expect(html).toContain('aria-label="Hide staff staff@example.test"');
    expect(html).toContain("Access granted (UTC)");
    expect(html).toContain("Last updated (UTC)");
    expect(html).toContain("Manage access");
    expect(html).toContain('colSpan="5"');
  });
});
