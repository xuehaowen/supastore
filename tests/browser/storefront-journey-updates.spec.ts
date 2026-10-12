import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { test, expect, deliveredLink, clickAction } from "./fixtures";

async function register(page: Page) {
  const email = `journey-${randomUUID()}@example.test`;
  await page.goto("/en/account");
  await page.getByLabel("Account action").selectOption("sign-up");
  await page.getByLabel("Name", { exact: true }).fill("Journey Customer");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("SyntheticCustomerPassword123!");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("check your inbox");
  await page.goto(await deliveredLink(page, email, "/api/auth/verify-email"));
  await expect(
    page.getByRole("button", { name: "Save profile" }),
  ).toBeVisible();
  return email;
}

async function issueCredit(admin: Page, email: string) {
  await admin.goto(`/admin/store-credit?q=${encodeURIComponent(email)}`);
  await admin
    .getByRole("button", { name: "Issue credit", exact: true })
    .click();
  const issue = admin.getByRole("dialog", {
    name: "Issue store credit",
    exact: true,
  });
  await issue
    .getByRole("combobox", { name: "Customer", exact: true })
    .selectOption({ index: 1 });
  await issue.getByLabel("Credit amount in minor units").fill("10000");
  await issue.getByLabel("Credit reason").fill("Journey credit");
  await clickAction(
    admin,
    issue.getByRole("button", { name: "Issue store credit", exact: true }),
  );
  await expect(
    admin.getByRole("alert").filter({ hasText: "Credit entry posted" }),
  ).toBeVisible();
}

test("account exposes persisted wallet activity, older orders and exact reference search", async ({
  page,
  admin,
  sql,
}) => {
  test.setTimeout(180000);
  const email = await register(page);
  await issueCredit(admin, email);
  const [variant] =
    await sql`select v.id from product_variants v join products p on p.id=v.product_id where p.handle='studio-cup' and v.is_available=true order by v.id limit 1`;
  const [payment] =
    await sql`select id from payment_accounts where is_active=true order by id limit 1`;
  const references: string[] = [];
  // Build real history through the storefront proxy. Each order has its own cart
  // identity, while the verified customer session stays signed in.
  for (let index = 0; index < 26; index++) {
    await page.context().clearCookies({ name: "shop-cart" });
    const options = { headers: { origin: process.env.APP_URL! } };
    const cartResponse = await page.request.post("/api/v1/cart", {
      ...options,
      data: { variantId: variant.id, quantity: 1, locale: "en" },
    });
    expect(cartResponse.ok()).toBe(true);
    const cart = (await cartResponse.json()).data;
    const quoteResponse = await page.request.post("/api/v1/quotes", {
      ...options,
      data: {
        cartId: cart.id,
        fulfillmentType: "shipping",
        country: "US",
        address: "1 Market Street",
        paymentAccountId: payment.id,
      },
    });
    expect(quoteResponse.ok()).toBe(true);
    const quote = (await quoteResponse.json()).data;
    const orderResponse = await page.request.post("/api/v1/orders", {
      ...options,
      data: {
        quoteId: quote.id,
        name: "Journey Customer",
        email,
        accepted: true,
      },
    });
    expect(orderResponse.ok()).toBe(true);
    references.push((await orderResponse.json()).data.referenceCode);
  }
  await page.reload();
  await expect(
    page.getByText("Available account credit: $100.00"),
  ).toBeVisible();
  await expect(page.getByText(/Journey credit/)).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: `${references[0]} · Awaiting payment`,
      exact: true,
    }),
  ).toHaveCount(0);
  await page
    .getByRole("navigation", { name: "Order history" })
    .getByRole("button", { name: "Next", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: `${references[0]} · Awaiting payment`,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Order history" })
      .getByRole("button", { name: "Next", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Order reference", { exact: true }).fill(references[0]);
  await page
    .getByRole("button", { name: "Search orders", exact: true })
    .click();
  await expect(
    page
      .getByRole("navigation", { name: "Order history" })
      .getByRole("button", { name: "Previous", exact: true }),
  ).toBeDisabled();
  await expect(
    page
      .getByRole("navigation", { name: "Order history" })
      .getByRole("button", { name: "Next", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", {
      name: `${references[0]} · Awaiting payment`,
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(/\/en\/orders\/[a-f0-9-]+$/);
  await expect(
    page.getByRole("heading", { name: `Order ${references[0]}`, exact: true }),
  ).toBeVisible();
});

test("saved address and mixed credit persist through submission, confirmation and account history", async ({
  page,
  admin,
  sql,
}) => {
  test.setTimeout(180000);
  const email = await register(page);
  await page.getByText("Add address", { exact: true }).click();
  const address = page.locator("details[open]");
  await address.getByLabel("Label", { exact: true }).fill("Home");
  await address
    .getByLabel("Recipient name", { exact: true })
    .fill("Journey Recipient");
  await address
    .getByLabel("Street address", { exact: true })
    .fill("1 Market Street");
  await address
    .getByLabel("Apartment (optional)", { exact: true })
    .fill("Apt 2");
  await address.getByLabel("City", { exact: true }).fill("San Francisco");
  await address.getByLabel("State / region", { exact: true }).fill("CA");
  await address.getByLabel("Postal code", { exact: true }).fill("94105");
  await address.getByLabel("Country code", { exact: true }).fill("US");
  await address
    .getByRole("button", { name: "Save address", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Address saved");
  await issueCredit(admin, email);
  await page.goto("/en/products/studio-cup");
  await page.getByRole("button", { name: "Add to cart", exact: true }).click();
  await page.getByRole("link", { name: "Checkout", exact: true }).click();
  await page
    .getByLabel("Fulfillment", { exact: true })
    .selectOption("shipping");
  await page
    .getByLabel("Saved address", { exact: true })
    .selectOption({ label: "Home" });
  await expect(page.getByLabel("Full shipping address")).toHaveValue(
    "1 Market Street, Apt 2, San Francisco",
  );
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
    "Journey Recipient",
  );
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue(email);
  await expect(page.getByText("Available credit: $100.00")).toBeVisible();
  await page.getByLabel("Account credit to apply (USD)").fill("5");
  await page.getByRole("button", { name: "Review final total" }).click();
  await expect(page.getByText("Credit applied: $5.00")).toBeVisible();
  await page.getByLabel("I accept this final total").check();
  await page.getByRole("button", { name: "Place order", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/orders\/[a-f0-9-]+$/);
  const id = page.url().split("/").at(-1)!;
  const [order] =
    await sql`select reference_code,purchase_total_cents,credit_applied_cents,shipping_address_snapshot,customer_id from orders where id=${id}`;
  expect(order.credit_applied_cents).toBe(500);
  expect(order.customer_id).toBeTruthy();
  expect(order.shipping_address_snapshot).toMatchObject({
    address: "1 Market Street, Apt 2, San Francisco",
    country: "US",
    region: "CA",
    postalCode: "94105",
  });
  await page.goto("/en/account");
  await expect(page.getByText("Reserved credit: $5.00")).toBeVisible();
  await expect(
    page.getByText("Available account credit: $95.00"),
  ).toBeVisible();
  await admin.goto(`/admin/orders/${id}`);
  await admin
    .getByRole("button", { name: "Record payment", exact: true })
    .click();
  const receipt = admin.getByRole("dialog", { name: "Record actual payment" });
  await receipt
    .getByLabel("Actual received amount in minor units")
    .fill(String(order.purchase_total_cents - 500));
  await receipt.getByLabel("Actual payment reference").fill(randomUUID());
  await receipt.getByRole("checkbox").check();
  await clickAction(
    admin,
    receipt.getByRole("button", { name: "Record receipt", exact: true }),
  );
  await clickAction(
    admin,
    admin.getByRole("button", { name: "Confirm exact payment", exact: true }),
  );
  await page.reload();
  await expect(page.getByText("Reserved credit: $0.00")).toBeVisible();
  await expect(
    page.getByText("Available account credit: $95.00"),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Recent credit activity" }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: `${order.reference_code} · Confirmed`,
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(new RegExp(`/en/orders/${id}$`));
  await expect(
    page.getByText("Confirmed", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("Remaining payment: $0.00")).toBeVisible();
  const [reservation] =
    await sql`select status from store_credit_reservations where order_id=${id}`;
  expect(reservation.status).toBe("captured");
});
