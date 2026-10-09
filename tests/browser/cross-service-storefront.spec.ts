import { test, expect } from "./fixtures";
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
test("separate storefront owns catalog/cart checkout and private order cookies", async ({
  page,
  sql,
}) => {
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
    await sql`select id,guest_email,fulfillment_type from orders where id=${id}`;
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
  await page.screenshot({
    path: test.info().outputPath("cross-service-order.png"),
    fullPage: true,
  });
});
test("customer registration/login/profile mutation stays behind the backend API", async ({
  page,
  sql,
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
  await sql`update "user" set email_verified=true where email=${email}`;
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
  await page.screenshot({
    path: test.info().outputPath("cross-service-account.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByLabel("Account action")).toBeVisible();
  await page.getByRole("link", { name: "中文", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "购物车", exact: true }),
  ).toBeVisible();
});
