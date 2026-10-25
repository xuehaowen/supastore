import { randomUUID } from "node:crypto";
import { test, expect } from "./fixtures";

test("category changes and filter recovery preserve the shopping search", async ({
  page,
  sql,
}) => {
  const categories =
    await sql`select slug,name from categories order by name limit 2`;
  expect(categories.length).toBeGreaterThan(0);
  const axis = `shopping-filter-${randomUUID()}`;
  const [attribute] =
    await sql`insert into attributes(code,name,kind) values(${axis},'Shopping option','variant') returning id`;
  const [cup] = await sql`select id from products where handle='studio-cup'`;
  await sql`insert into attribute_values(attribute_id,code,label) values(${attribute!.id},'choice','Choice')`;
  await sql`insert into product_options(product_id,attribute_id) values(${cup!.id},${attribute!.id})`;
  try {
    await page.goto(
      `/en/search?q=missing-shopping-test&sort=price-high&options=${axis}:choice`,
    );
    await page
      .locator('.catalog-desktop-filters [name="category"]')
      .selectOption(categories[0]!.slug);
    await page
      .locator(".catalog-desktop-filters")
      .getByRole("button", { name: "Apply filters", exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp("category=" + categories[0]!.slug));
    let url = new URL(page.url());
    expect(url.searchParams.get("q")).toBe("missing-shopping-test");
    expect(url.searchParams.get("sort")).toBe("price-high");
    expect(url.searchParams.getAll("options")).toEqual([`${axis}:choice`]);
    await page
      .getByRole("navigation", { name: "Active filters" })
      .getByRole("link", { name: /Clear filters/ })
      .click();
    await expect
      .poll(() => new URL(page.url()).searchParams.has("options"))
      .toBe(false);
    url = new URL(page.url());
    expect(url.searchParams.get("q")).toBe("missing-shopping-test");
    expect(url.searchParams.get("sort")).toBe("price-high");
    expect(url.searchParams.has("options")).toBe(false);
    expect(url.searchParams.has("category")).toBe(false);
    await expect(
      page.getByRole("navigation", { name: "Active filters" }),
    ).toHaveCount(0);
  } finally {
    await sql`delete from product_options where attribute_id=${attribute!.id}`;
    await sql`delete from attribute_values where attribute_id=${attribute!.id}`;
    await sql`delete from attributes where id=${attribute!.id}`;
  }
});

test("cards show purchasable variant prices and unavailable stock", async ({
  page,
  sql,
}) => {
  const key = randomUUID();
  const [product] =
    await sql`insert into products(handle,title,is_published) values(${`shopping-${key}`},${`Shopping UX ${key}`},true) returning id`;
  try {
    const variants =
      await sql`insert into product_variants(product_id,sku,title,price_cents,is_available) values
      (${product!.id},${`UX-${key}-a`},'Available',1200,true),
      (${product!.id},${`UX-${key}-b`},'Premium',1800,true),
      (${product!.id},${`UX-${key}-c`},'Reserved',200,true) returning id,price_cents`;
    for (const variant of variants)
      await sql`insert into variant_stock(variant_id,tracking_enabled,on_hand,reserved) values(${variant.id},true,2,${variant.price_cents === 200 ? 2 : 0})`;
    await page.goto(`/en/search?q=${key}`);
    const card = page.locator(".storefront-product-card");
    await expect(card).toContainText("From $12.00");
    await expect(card).not.toContainText("$2.00");
    await sql`update variant_stock set reserved=on_hand where variant_id in (select id from product_variants where product_id=${product!.id})`;
    await page.reload();
    await expect(card).toContainText("Currently unavailable");
  } finally {
    await sql`delete from variant_stock where variant_id in (select id from product_variants where product_id=${product!.id})`;
    await sql`delete from product_variants where product_id=${product!.id}`;
    await sql`delete from products where id=${product!.id}`;
  }
});

test("checkout keeps the recipient, apartment and city through review and editing", async ({
  page,
  sql,
}) => {
  await page.goto("/en/products/studio-cup");
  await page.getByRole("button", { name: "Add to bag", exact: true }).click();
  await page.getByRole("link", { name: "View bag", exact: true }).click();
  await page.getByRole("link", { name: "Continue to checkout" }).click();
  await page.getByLabel("Recipient name", { exact: true }).fill("Alex Chen");
  await page.getByLabel("Street address", { exact: true }).fill("12 Main St");
  await page.getByLabel("Apartment (optional)", { exact: true }).fill("Apt 4");
  await page.getByLabel("City", { exact: true }).fill("Oakland");
  await page.getByLabel("State / region", { exact: true }).selectOption("CA");
  await page.getByLabel("ZIP / postal code", { exact: true }).fill("94612");
  await page.getByRole("button", { name: /Review your order/ }).click();
  await expect(
    page.getByRole("link", { name: "Edit fulfillment" }),
  ).toBeVisible();
  await expect(page.locator("main")).toContainText(
    "Alex Chen, 12 Main St, Apt 4, Oakland",
  );
  const id = new URL(page.url()).searchParams.get("quote");
  const [quote] = await sql`select terms_snapshot from quotes where id=${id}`;
  expect(quote!.terms_snapshot.shippingAddress).toMatchObject({
    recipientName: "Alex Chen",
    address: "12 Main St",
    line2: "Apt 4",
    city: "Oakland",
  });
  await page.getByRole("link", { name: "Edit fulfillment" }).click();
  await expect(page.getByLabel("Street address", { exact: true })).toHaveValue(
    "12 Main St",
  );
  await expect(page.getByLabel("Recipient name", { exact: true })).toHaveValue(
    "Alex Chen",
  );
  await expect(
    page.getByLabel("Apartment (optional)", { exact: true }),
  ).toHaveValue("Apt 4");
  await expect(page.getByLabel("City", { exact: true })).toHaveValue("Oakland");
});

test("mobile search is direct and the last removed bag item can be restored", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/en");
  await page
    .locator(".storefront-mobile-actions")
    .getByRole("link", { name: "Search", exact: true })
    .click();
  await expect(page).toHaveURL(/\/en\/search$/);
  await page.goto("/en/products/studio-cup");
  await page.getByRole("button", { name: "Add to bag", exact: true }).click();
  await page.getByRole("link", { name: "View bag", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Decrease quantity/ }),
  ).toBeDisabled();
  await page.getByRole("button", { name: /Remove · Studio cup/ }).click();
  await expect(page.locator(".cart-item-info")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Undo removal" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Undo removal" }).click();
  await expect(page.locator(".cart-item-info")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Undo removal" })).toHaveCount(
    0,
  );
  await expect(
    page.locator(".storefront-mobile-actions .bag-count"),
  ).toHaveText("1");
  await page.getByRole("button", { name: /Increase quantity/ }).click();
  await expect(
    page.locator(".storefront-mobile-actions .bag-count"),
  ).toHaveText("2");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("saved addresses fill separate checkout fields and can be cleared", async ({
  page,
  sql,
}) => {
  const email = `shopping-${randomUUID()}@example.test`;
  const password = "ShoppingAddressPassword123!";
  const headers = { origin: process.env.APP_URL! };
  const signup = await page.request.post("/api/auth/sign-up/email", {
    headers,
    data: { email, password, name: "Shopping customer" },
  });
  expect(signup.ok(), await signup.text()).toBe(true);
  await sql`update "user" set email_verified=true where email=${email}`;
  const signin = await page.request.post("/api/auth/sign-in/email", {
    headers,
    data: { email, password },
  });
  expect(signin.ok(), await signin.text()).toBe(true);
  const saved = await page.request.post("/api/v1/account/addresses", {
    headers,
    data: {
      label: "Home",
      name: "Alex Chen",
      line1: "12 Main St",
      line2: "Apt 4",
      city: "Oakland",
      region: "CA",
      postalCode: "94612",
      country: "US",
    },
  });
  expect(saved.ok(), await saved.text()).toBe(true);
  await page.goto("/en/products/studio-cup");
  await page.getByRole("button", { name: "Add to bag", exact: true }).click();
  await page.getByRole("link", { name: "View bag", exact: true }).click();
  await page.getByRole("link", { name: "Continue to checkout" }).click();
  const selector = page
    .locator("select")
    .filter({ has: page.locator("option", { hasText: "Home" }) });
  await selector.selectOption({ label: "Home" });
  await expect(page.getByLabel("Street address", { exact: true })).toHaveValue(
    "12 Main St",
  );
  await expect(page.getByLabel("Recipient name", { exact: true })).toHaveValue(
    "Alex Chen",
  );
  await expect(
    page.getByLabel("Apartment (optional)", { exact: true }),
  ).toHaveValue("Apt 4");
  await expect(page.getByLabel("City", { exact: true })).toHaveValue("Oakland");
  await expect(page.getByLabel("State / region", { exact: true })).toHaveValue(
    "CA",
  );
  await expect(
    page.getByLabel("ZIP / postal code", { exact: true }),
  ).toHaveValue("94612");
  await selector.selectOption("");
  for (const name of [
    "Street address",
    "Recipient name",
    "Apartment (optional)",
    "City",
    "ZIP / postal code",
  ])
    await expect(page.getByLabel(name, { exact: true })).toHaveValue("");
  await page.goto("/en/account");
  await page.route("**/api/auth/sign-out", (route) => route.abort("failed"));
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page
      .locator('[role="alert"]')
      .filter({ hasText: "We couldn't sign you out" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save profile", exact: true }),
  ).toBeVisible();
  await page.unroute("**/api/auth/sign-out");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/en$/);
});

test("bag update failures keep the item and allow retry", async ({ page }) => {
  await page.goto("/en/products/studio-cup");
  await page.getByRole("button", { name: "Add to bag", exact: true }).click();
  await page.getByRole("link", { name: "View bag", exact: true }).click();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/en/cart", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await gate;
    await route.abort("failed");
  });
  await page.getByRole("button", { name: /Remove · Studio cup/ }).click();
  await expect(
    page.getByRole("button", { name: /Increase quantity/ }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: /Remove · Studio cup/ }),
  ).toBeDisabled();
  release();
  await expect(page.locator('[data-slot="alert"]')).toBeVisible();
  await expect(page.locator(".cart-item-info")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Undo removal" })).toHaveCount(
    0,
  );
  await page.unroute("**/en/cart");
  await page.getByRole("button", { name: /Remove · Studio cup/ }).click();
  await expect(
    page.getByRole("button", { name: "Undo removal" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Undo removal" }).click();
  await expect(page.locator(".cart-item-info")).toHaveCount(1);
});
