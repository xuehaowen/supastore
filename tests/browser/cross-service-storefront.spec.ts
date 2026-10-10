import { randomUUID } from "node:crypto";
import {
  test,
  expect,
  clickAction,
  deliveredLink,
  clientHeaders,
} from "./fixtures";
for (const mode of ["shipping", "pickup", "local_delivery", "none"] as const) {
  test(`separate storefront honors ${mode}-only fulfillment policy`, async ({
    page,
    sql,
  }) => {
    const [saved] =
      await sql`select commerce_policy from store_settings limit 1`;
    const [area] =
      await sql`insert into delivery_areas(name,country_codes,postal_prefixes,rate_cents) values('Policy delivery','["US"]'::jsonb,'["94"]'::jsonb,700) returning id`;
    try {
      const policy = {
        ...saved!.commerce_policy,
        shippingEnabled: mode === "shipping",
        pickupEnabled: mode === "pickup",
        deliveryEnabled: mode === "local_delivery",
      };
      await sql`update store_settings set commerce_policy=${sql.json(policy)},quote_version=quote_version+1`;
      await page.goto("/en/products/studio-cup");
      await page.getByRole("button", { name: "Add to cart" }).click();
      await page.getByRole("link", { name: "Checkout", exact: true }).click();
      const choice = page.getByLabel("Fulfillment", { exact: true });
      await expect(choice.locator("option")).toHaveCount(
        mode === "none" ? 0 : 1,
      );
      if (mode === "none") {
        await expect(
          page.getByRole("button", { name: "Review final total" }),
        ).toBeDisabled();
        await expect(
          page.getByText(
            "No fulfillment methods are available. Please contact the store.",
          ),
        ).toBeVisible();
      } else {
        await expect(choice).toHaveValue(mode);
        if (mode === "local_delivery") {
          await page
            .getByLabel("Name", { exact: true })
            .fill("Delivery customer");
          await page
            .getByLabel("Email", { exact: true })
            .fill("delivery-api@example.test");
          await page
            .getByLabel("Full shipping address")
            .fill("1 Market Street");
          await page.getByLabel("Postal code", { exact: true }).fill("94105");
          const response = page.waitForResponse(
            (r) =>
              r.url().endsWith("/api/v1/quotes") &&
              r.request().method() === "POST",
          );
          await page
            .getByRole("button", { name: "Review final total" })
            .click();
          const result = await (await response).json();
          expect(result.data.shippingCents).toBe(700);
        }
      }
    } finally {
      await sql`delete from delivery_areas where id=${area!.id}`;
      await sql`update store_settings set commerce_policy=${sql.json(saved!.commerce_policy)},quote_version=quote_version+1`;
    }
  });
}
test("separate storefront applies regional shipping through the quote API", async ({
  page,
  sql,
}) => {
  const [zone] =
    await sql`insert into shipping_zones(name,country_codes,region_codes,postal_prefixes,rate_cents) values('CUJ West Coast','["US"]'::jsonb,'["CA","OR","WA"]'::jsonb,'["94"]'::jsonb,800) returning id`;
  try {
    await page.goto("/en/products/studio-cup");
    await page.getByRole("button", { name: "Add to cart" }).click();
    await page.getByRole("link", { name: "Checkout", exact: true }).click();
    await page.getByLabel("Name", { exact: true }).fill("Regional Customer");
    await page
      .getByLabel("Email", { exact: true })
      .fill("regional@example.test");
    await page.getByLabel("Country", { exact: true }).selectOption("US");
    await expect(
      page.getByLabel("Country", { exact: true }).locator("option:checked"),
    ).toHaveText("United States");
    await page.getByLabel("State / region", { exact: true }).selectOption("CA");
    await page.getByLabel("Postal code", { exact: true }).fill("94105");
    await page.getByLabel("Country", { exact: true }).selectOption("CA");
    await expect(page.getByLabel("Postal code", { exact: true })).toHaveValue(
      "",
    );
    await page.getByLabel("Country", { exact: true }).selectOption("US");
    await page.getByLabel("State / region", { exact: true }).selectOption("CA");
    await page.getByLabel("Postal code", { exact: true }).fill("94105");
    await page.getByLabel("Full shipping address").fill("1 Market Street");
    const response = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/v1/quotes") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Review final total" }).click();
    const body = await (await response).json();
    expect(body.data.shippingCents).toBe(800);
    const [quote] =
      await sql`select terms_snapshot from quotes where id=${body.data.id}`;
    expect(quote.terms_snapshot.shippingAddress).toMatchObject({
      country: "US",
      region: "CA",
      postalCode: "94105",
    });
    await expect(page.getByText("Order total:")).toBeVisible();
  } finally {
    await sql`delete from shipping_zones where id=${zone.id}`;
    await sql`update store_settings set quote_version=quote_version+1`;
  }
});
test("separate storefront completes guest checkout, payment evidence, delivery, return and refund", async ({
  page,
  sql,
  admin,
}) => {
  test.setTimeout(180000);
  await page.goto("/en");
  await expect(page.locator("article h2 a").first()).toBeVisible();
  await page.locator("article h2 a").first().click();
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page).toHaveURL(/\/en\/cart$/);
  await expect(
    page.getByRole("heading", { name: "Cart", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Checkout", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Cross Service Customer");
  await page
    .getByLabel("Email", { exact: true })
    .fill("cross-service@example.test");
  await page
    .getByLabel("Fulfillment", { exact: true })
    .selectOption("shipping");
  await page.getByLabel("Country", { exact: true }).selectOption("US");
  await page
    .getByLabel("Full shipping address")
    .fill("123 Synthetic Street, Seattle, WA 98101");
  await page.getByRole("button", { name: "Review final total" }).click();
  await expect(page.getByText("Order total:")).toBeVisible();
  await page.getByLabel("I accept this final total").check();
  await page.getByRole("button", { name: "Place order", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/orders\/[a-f0-9-]+$/);
  const id = page.url().split("/").at(-1)!;
  const [order] =
    await sql`select id,guest_email,fulfillment_type,purchase_total_cents from orders where id=${id}`;
  expect(order.guest_email).toBe("cross-service@example.test");
  expect(order.fulfillment_type).toBe("shipping");
  const cookies = await page.context().cookies();
  expect(
    cookies.some((cookie) => cookie.name === "shop-cart" && cookie.httpOnly),
  ).toBe(true);
  expect(
    cookies.some(
      (cookie) => cookie.name.startsWith("shop-order-") && cookie.httpOnly,
    ),
  ).toBe(true);
  const privateOrder = await page.request.get(`/api/v1/orders/${id}`);
  expect(privateOrder.ok()).toBe(true);
  const support = page.getByRole("link", {
    name: "Contact support about this order",
  });
  await expect(support).toHaveAttribute("href", /mailto:.*subject=Order/);
  await expect(page.getByText(/Remaining payment:/)).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("cross-service-order.png"),
    fullPage: true,
  });
  await page.getByLabel("Payment evidence").setInputFiles({
    name: "receipt.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAGUlEQVQokWN4+uI+SYhhVMOL0VB6OlyTBgCmaawfkFnzKAAAAABJRU5ErkJggg==",
      "base64",
    ),
  });
  await page
    .getByRole("button", { name: "Submit evidence", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Payment evidence submitted for store review.",
  );
  await admin.goto(`/admin/orders/${id}`);
  await admin
    .getByRole("button", { name: "Record payment", exact: true })
    .click();
  const payment = admin.getByRole("dialog", { name: "Record actual payment" });
  await payment
    .getByLabel("Actual received amount in minor units")
    .fill(String(order.purchase_total_cents));
  await payment.getByLabel("Actual payment reference").fill(randomUUID());
  await payment.getByRole("checkbox").check();
  await clickAction(
    admin,
    payment.getByRole("button", { name: "Record receipt", exact: true }),
  );
  await clickAction(
    admin,
    admin.getByRole("button", { name: "Confirm exact payment", exact: true }),
  );
  await page.reload();
  await expect(
    page.getByText("Confirmed", { exact: true }).first(),
  ).toBeVisible();
  await admin
    .getByRole("button", { name: "Dispatch shipment", exact: true })
    .click();
  const dispatch = admin.getByRole("dialog", {
    name: "Dispatch shipment",
    exact: true,
  });
  await dispatch
    .getByLabel("Carrier or delivery method")
    .fill("Synthetic delivery");
  await clickAction(
    admin,
    dispatch.getByRole("button", { name: "Dispatch shipment", exact: true }),
  );
  await admin
    .getByRole("button", { name: "Record delivery", exact: true })
    .click();
  const delivery = admin.getByRole("dialog", {
    name: "Record completed delivery",
    exact: true,
  });
  await delivery
    .getByLabel("Carrier or delivery method")
    .fill("Synthetic delivery");
  await clickAction(
    admin,
    delivery.getByRole("button", { name: "Record delivery", exact: true }),
  );
  await page.reload();
  await expect(
    page.getByText("Completed", { exact: true }).first(),
  ).toBeVisible();
  await page
    .getByLabel(/Return quantity/)
    .first()
    .fill("1");
  await page
    .getByLabel("Return reason", { exact: true })
    .fill("Synthetic return request");
  await page
    .getByRole("button", { name: "Request a return", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Return request submitted",
  );
  await expect(
    page.getByRole("heading", { name: "Returns", exact: true }),
  ).toBeVisible();
  const [goodsReturn] =
    await sql`select status from order_returns where order_id=${id}`;
  expect(goodsReturn.status).toBe("requested");
  await admin.reload();
  await admin
    .getByRole("link", { name: "Synthetic return request · requested" })
    .click();
  await admin
    .getByRole("combobox", { name: "Decision" })
    .selectOption("approved");
  await admin.getByLabel("Review reason").fill("Return approved");
  await clickAction(
    admin,
    admin.getByRole("button", { name: "Save decision" }),
  );
  await admin.getByLabel("Restockable units").fill("1");
  await clickAction(
    admin,
    admin.getByRole("button", { name: "Record goods receipt" }),
  );
  await admin.goto(`/admin/orders/${id}`);
  await admin
    .getByRole("button", { name: "Refund purchase", exact: true })
    .click();
  const refund = admin.getByRole("dialog", {
    name: "Authorize purchase refund",
  });
  await refund
    .getByLabel("Refund amount in minor units")
    .fill(String(order.purchase_total_cents));
  await refund.getByLabel("Refund reason").fill("Cross-service refund");
  await clickAction(
    admin,
    refund.getByRole("button", { name: "Authorize source-aware refund" }),
  );
  const [allocation] =
    await sql`select pa.id from payout_allocations pa join refund_authorizations ra on ra.id=pa.refund_authorization_id where ra.order_id=${id} and ra.reason='Cross-service refund'`;
  expect(allocation).toBeTruthy();
  await admin.goto("/admin/payments");
  const payout = admin
    .locator("#payouts details")
    .filter({ hasText: allocation.id });
  await payout.locator("summary").click();
  await payout
    .getByLabel("Claim amount (minor units)")
    .fill(String(order.purchase_total_cents));
  await payout
    .getByLabel("Verified return destination")
    .fill("SYNTHETIC-RETURN");
  await clickAction(
    admin,
    payout.getByRole("button", { name: "Claim payout", exact: true }),
  );
  await payout.locator("summary").click();
  await payout
    .getByLabel("Actual payout amount (minor units)")
    .fill(String(order.purchase_total_cents));
  await payout.getByLabel("Transfer reference").fill(randomUUID());
  await payout.getByLabel("Actual destination").fill("SYNTHETIC-RETURN");
  await clickAction(
    admin,
    payout.getByRole("button", { name: "Reconcile payout", exact: true }),
  );
  await page.reload();
  await expect(page.getByText(/Cross-service refund/)).toBeVisible();
  const finalOrder = await page.request.get(`/api/v1/orders/${id}`);
  expect(finalOrder.ok()).toBe(true);
  const final = await finalOrder.json();
  expect(final.data.order.lifecycleStatus).toBe("completed");
  expect(final.data.fulfillment.status).toBe("fulfilled");
  expect(final.data.refunds).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        reason: "Cross-service refund",
        amountCents: order.purchase_total_cents,
        settledCents: order.purchase_total_cents,
      }),
    ]),
  );
});
test("customer registration/login/profile mutation stays behind the backend API", async ({
  page,
  sql,
  browser,
}) => {
  const email = `cross-auth-${Date.now()}@example.test`;
  await page.goto("/en/account");
  await page.getByLabel("Account action").selectOption("sign-up");
  await page.getByLabel("Name", { exact: true }).fill("New Customer");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("SyntheticCustomerPassword123!");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("check your inbox");
  await page.getByLabel("Account action").selectOption("sign-in");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("SyntheticCustomerPassword123!");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "Please verify your email",
  );
  await expect(page.getByRole("button", { name: "Save profile" })).toHaveCount(
    0,
  );
  const verification = await deliveredLink(
    page,
    email,
    "/api/auth/verify-email",
  );
  await page.goto(verification);
  await expect(
    page.getByRole("button", { name: "Save profile" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByLabel("Account action").selectOption("sign-in");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("SyntheticCustomerPassword123!");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Save profile" }),
  ).toBeVisible();
  await page.getByLabel("Name", { exact: true }).fill("Updated Customer");
  await page.getByLabel("Phone", { exact: true }).fill("+1 555 0100");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved");
  const [customer] =
    await sql`select name,phone from customers where email=${email}`;
  expect(customer.name).toBe("Updated Customer");
  expect(customer.phone).toBe("+1 555 0100");
  await page
    .getByLabel("Current password", { exact: true })
    .fill("SyntheticCustomerPassword123!");
  await page
    .getByLabel("New password", { exact: true })
    .fill("SyntheticChangedPassword123!");
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill("SyntheticChangedPassword123!");
  await page
    .getByRole("button", { name: "Update password", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Password updated");
  await page.screenshot({
    path: test.info().outputPath("cross-service-account.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByLabel("Account action")).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("SyntheticChangedPassword123!");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Save profile" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByLabel("Account action").selectOption("forgot");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("check your inbox");
  const reset = await deliveredLink(page, email, "/api/auth/reset-password/");
  // The emailed recovery link opens on a separate device, with its own session
  // and rate bucket. Production sign-in limits remain active on both devices.
  const resetContext = await browser.newContext({
    baseURL: process.env.PLAYWRIGHT_BASE_URL!,
    extraHTTPHeaders: clientHeaders(),
  });
  const resetPage = await resetContext.newPage();
  try {
    await resetPage.goto(reset);
    await resetPage
      .getByLabel("New password", { exact: true })
      .fill("SyntheticResetPassword123!");
    await resetPage
      .getByLabel("Confirm password", { exact: true })
      .fill("SyntheticResetPassword123!");
    await resetPage
      .getByRole("button", { name: "Update password", exact: true })
      .click();
    await expect(resetPage).toHaveURL(/\/en\/account$/);
    await resetPage.getByLabel("Email", { exact: true }).fill(email);
    await resetPage
      .getByLabel("Password", { exact: true })
      .fill("SyntheticChangedPassword123!");
    const rejectedSignIn = resetPage.waitForResponse(
      (response) =>
        response.url().endsWith("/api/auth/sign-in/email") &&
        response.request().method() === "POST",
    );
    await resetPage
      .getByRole("button", { name: "Continue", exact: true })
      .click();
    expect((await rejectedSignIn).status()).toBe(401);
    await expect(
      resetPage.getByRole("button", { name: "Continue", exact: true }),
    ).toBeEnabled();
    await expect(
      resetPage.getByRole("button", { name: "Save profile" }),
    ).toHaveCount(0);
    await resetPage
      .getByLabel("Password", { exact: true })
      .fill("SyntheticResetPassword123!");
    await resetPage
      .getByRole("button", { name: "Continue", exact: true })
      .click();
    await expect(
      resetPage.getByRole("button", { name: "Save profile" }),
    ).toBeVisible();
    await resetPage
      .getByRole("button", { name: "Sign out", exact: true })
      .click();
    await resetPage.getByRole("link", { name: "中文", exact: true }).click();
    await expect(
      resetPage.getByRole("link", { name: "购物车", exact: true }),
    ).toBeVisible();
  } finally {
    await resetContext.close();
  }
});
