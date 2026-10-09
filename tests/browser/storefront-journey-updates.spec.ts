import { test, expect } from "./fixtures";

const account = {
  customer: {
    name: "Journey Customer",
    email: "journey@example.test",
    phone: null,
  },
  addresses: [
    {
      id: "saved-home",
      label: "Home",
      address: {
        name: "Journey Recipient",
        line1: "1 Market Street",
        line2: "Apt 2",
        city: "San Francisco",
        region: "CA",
        postalCode: "94105",
        country: "US",
      },
    },
  ],
  orders: [
    {
      id: "test-order",
      referenceCode: "SP-FIRST",
      lifecycleStatus: "completed",
      purchaseTotalCents: 3200,
      createdAt: "2026-10-01T00:00:00Z",
    },
  ],
  hasNext: true,
  credit: {
    balanceCents: 10000,
    reservedCents: 1000,
    currency: "USD",
    precision: 2,
    entries: [
      {
        id: "credit-entry",
        kind: "purchase",
        amountCents: -1000,
        createdAt: "2026-10-01T00:00:00Z",
      },
    ],
  },
};

test("account exposes wallet activity, older orders and exact reference search", async ({
  page,
}) => {
  await page.route("**/api/v1/account?*", async (route) => {
    const query = new URL(route.request().url()).searchParams;
    const second = query.get("page") === "2";
    const reference = query.get("reference");
    await route.fulfill({
      json: {
        data: {
          ...account,
          orders: reference
            ? [{ ...account.orders[0], referenceCode: reference }]
            : [
                {
                  ...account.orders[0],
                  referenceCode: second ? "SP-OLDER" : "SP-FIRST",
                },
              ],
          hasNext: !second && !reference,
        },
      },
    });
  });
  await page.route("**/api/v1/account", (route) =>
    route.fulfill({ json: { data: account } }),
  );
  await page.goto("/en/account");
  await expect(page.getByText("Reserved credit: $10.00")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Recent credit activity" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("button", { name: /SP-OLDER/ })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Next", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Order reference", { exact: true }).fill("SP-SEARCH");
  await page
    .getByRole("button", { name: "Search orders", exact: true })
    .click();
  await expect(page.getByRole("button", { name: /SP-SEARCH/ })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Previous", exact: true }),
  ).toBeDisabled();
});

test("checkout fills saved addresses and reviews credit plus remaining payment", async ({
  page,
}) => {
  await page.route("**/api/v1/account", (route) =>
    route.fulfill({ json: { data: account } }),
  );
  await page.goto("/en/products/studio-cup");
  await page.getByRole("button", { name: "Add to cart", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/cart$/);
  await page.goto("/en/checkout");
  await page
    .getByLabel("Fulfillment", { exact: true })
    .selectOption("shipping");
  await page
    .getByLabel("Saved address", { exact: true })
    .selectOption("saved-home");
  await expect(page.getByLabel("Full shipping address")).toHaveValue(
    "1 Market Street, Apt 2, San Francisco",
  );
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
    "Journey Recipient",
  );
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue(
    "journey@example.test",
  );
  await expect(page.getByText("Available credit: $90.00")).toBeVisible();
  await page.getByLabel("Account credit to apply (USD)").fill("5");
  await page.getByRole("button", { name: "Review final total" }).click();
  await expect(page.getByText("Credit applied: $5.00")).toBeVisible();
  await expect(page.getByText(/Remaining payment: \$/)).toBeVisible();
});
