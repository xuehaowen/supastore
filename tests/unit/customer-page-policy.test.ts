import { expect, it, vi } from "vitest";
import { store } from "../fixtures/customer-pages";
import { layoutPage } from "@/infrastructure/http/customer-page-data";
import { parseCustomerPage } from "@supastore/contracts";

// The persisted default from migration 0022, before later optional policy fields.
const legacyPolicy = vi.hoisted(() => ({
  guestCheckout: true,
  rewardsEnabled: false,
  rewardRateBasisPoints: 500,
  shippingEnabled: true,
  pickupEnabled: true,
  salesThresholdCents: null,
}));
vi.mock("@/infrastructure/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        limit: async () => [{ ...store, commercePolicy: legacyPolicy }],
      }),
    }),
  },
}));
vi.mock("@/infrastructure/auth", () => ({
  auth: { api: { getSession: async () => null } },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

it("publishes a complete policy for stores using the original migration default", async () => {
  const response = await layoutPage();
  expect(response.store?.commercePolicy).toMatchObject({
    ...legacyPolicy,
    deliveryEnabled: false,
    fiscalYearStartMonth: 1,
    rewardEligibleCategoryIds: [],
    rewardsStartAt: null,
    rewardsEndAt: null,
  });
  expect(() =>
    parseCustomerPage("layout", JSON.parse(JSON.stringify(response))),
  ).not.toThrow();
});
