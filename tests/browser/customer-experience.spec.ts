import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { test, expect, checkout } from "./fixtures";

test("shopping options recover from failure and only offer configured fulfillment", async ({
  page,
  sql,
}) => {
  const [original] = await sql`select commerce_policy from store_settings`;
  try {
    await sql`update store_settings set commerce_policy=commerce_policy || '{"shippingEnabled":false,"pickupEnabled":true,"deliveryEnabled":false}'::jsonb,quote_version=quote_version+1`;
    await page.goto("/en/products/studio-cup");
    await page.getByRole("button", { name: "Add to bag", exact: true }).click();
    await page.route("**/api/v1/evaluation", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: "{}",
      }),
    );
    await page.getByRole("link", { name: "View bag", exact: true }).click();
    const options = page.getByRole("region", { name: "Shopping options" });
    await expect(options.getByRole("alert")).toBeVisible();
    await expect(
      options.getByRole("button", { name: "Check options", exact: true }),
    ).toBeDisabled();
    await page.unroute("**/api/v1/evaluation");
    await options
      .getByRole("button", { name: "Retry loading options", exact: true })
      .click();
    await expect(options.locator("select").first()).toBeEnabled();
    await expect(
      options.locator("select").first().locator('option:not([value=""])'),
    ).toHaveText(["Pickup"]);
    await expect(
      options.locator('select[name="pickupLocationId"]'),
    ).toBeVisible();
  } finally {
    await sql`update store_settings set commerce_policy=${sql.json(original!.commerce_policy)},quote_version=quote_version+1`;
  }
});

test("product enlargement supports zoom, gallery navigation and keyboard return", async ({
  page,
}) => {
  await page.goto("/en/products/studio-cup");
  const trigger = page.getByRole("button", {
    name: "Enlarge image",
    exact: true,
  });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Studio cup", exact: true });
  await expect(dialog).toBeVisible();
  const original = await dialog.locator("img").getAttribute("src");
  await dialog.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(dialog.locator("img")).toHaveClass(/product-zoom-enlarged/);
  await dialog.getByRole("button", { name: "Next photo", exact: true }).click();
  await expect(dialog.locator("img")).not.toHaveAttribute("src", original!);
  await expect(dialog.locator("img")).toHaveClass(/product-zoom-fit/);
  const scan = await new AxeBuilder({ page })
    .include('[role="dialog"]')
    .analyze();
  expect(
    scan.violations.filter((item) =>
      ["serious", "critical"].includes(item.impact ?? ""),
    ),
  ).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("mobile purchase bar submits the current product form", async ({
  page,
  sql,
}) => {
  const handle = `mobile-purchase-${randomUUID()}`;
  const [product] =
    await sql`insert into products(handle,title,description,is_published) values(${handle},'Long product',${"Detailed product information.\n\n".repeat(80)},true) returning id`;
  await sql`insert into product_variants(product_id,sku,title,price_cents,is_available) values(${product!.id},${handle},'Default',2400,true)`;
  await page.setViewportSize({ width: 375, height: 700 });
  await page.goto(`/en/products/${handle}`);
  await expect(
    page.getByRole("complementary", { name: "Quick purchase" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Increase quantity", exact: true })
    .click();
  await page.locator("summary").filter({ hasText: "Product details" }).click();
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight),
  );
  const bar = page.getByRole("complementary", { name: "Quick purchase" });
  await expect(bar).toBeVisible();
  await expect(bar).toContainText("Quantity: 2");
  await bar.getByRole("button", { name: "Add to bag", exact: true }).click();
  await expect(
    page.locator(".storefront-mobile-actions .bag-count"),
  ).toHaveText("2");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("checkout explains invalid fields, focuses them and announces submission progress", async ({
  page,
}) => {
  await page.goto("/en/products/studio-cup");
  await page.getByRole("button", { name: "Add to bag", exact: true }).click();
  await page.getByRole("link", { name: "View bag", exact: true }).click();
  await page.getByRole("link", { name: "Continue to checkout" }).click();
  await page.getByRole("button", { name: /Review your order/ }).click();
  const street = page.getByRole("textbox", {
    name: "Street address",
    exact: true,
  });
  await expect(street).toBeFocused();
  await expect(street).toHaveAttribute("aria-invalid", "true");
  await expect(street).toHaveAccessibleDescription("Complete this field.");
  await street.fill("12 Main Street");
  await page
    .getByRole("textbox", { name: "Promotion code", exact: true })
    .fill("INVALID-UX-PROMOTION");
  await page.getByRole("button", { name: /Review your order/ }).click();
  await expect(
    page.getByRole("textbox", { name: "Promotion code", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole("textbox", { name: "Promotion code", exact: true }),
  ).toHaveAttribute("aria-invalid", "true");
  await page
    .getByRole("textbox", { name: "Promotion code", exact: true })
    .fill("");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/en/checkout", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await gate;
    await route.continue();
  });
  await page.getByRole("button", { name: /Review your order/ }).click();
  await expect(
    page.getByRole("button", { name: /Preparing your order/ }),
  ).toBeDisabled();
  release();
  await expect(
    page.getByRole("link", { name: "Edit fulfillment" }),
  ).toBeVisible();
  await page.unroute("**/en/checkout");
  await page
    .getByRole("button", { name: /Accept total & place order/ })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Your name", exact: true }),
  ).toBeFocused();
  await page
    .getByRole("textbox", { name: "Your name", exact: true })
    .fill("Alex Chen");
  await page
    .getByRole("textbox", { name: "Email address", exact: true })
    .fill("invalid");
  await page
    .getByRole("button", { name: /Accept total & place order/ })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Email address", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole("textbox", { name: "Email address", exact: true }),
  ).toHaveAccessibleDescription("Enter a valid email address.");
});

test("the bag estimates configured shipping and free-shipping qualification", async ({
  page,
  sql,
}) => {
  const [zone] =
    await sql`insert into shipping_zones(name,country_codes,region_codes,postal_prefixes,rate_cents,free_threshold_cents,sort_order) values('Customer UX estimate','["US"]','["CA"]','["946"]',875,3000,-100) returning id`;
  try {
    await page.goto("/en/products/studio-cup");
    await page.getByRole("button", { name: "Add to bag", exact: true }).click();
    await page.getByRole("link", { name: "View bag", exact: true }).click();
    const options = page.getByRole("region", { name: "Shopping options" });
    await options.locator("select").first().selectOption("shipping");
    await options.locator('select[name="country"]').selectOption("US");
    await options.locator('select[name="region"]').selectOption("CA");
    await options.locator('[name="postalCode"]').fill("94612");
    await options
      .getByRole("button", { name: "Check options", exact: true })
      .click();
    await expect(options).toContainText("Estimated delivery cost: $8.75");
    await expect(options).toContainText(
      "Add $6.00 to qualify for free shipping.",
    );
    await page.getByRole("button", { name: /Increase quantity for/ }).click();
    await expect(page.locator(".storefront-desktop-nav .bag-count")).toHaveText(
      "2",
    );
    await options
      .getByRole("button", { name: "Check options", exact: true })
      .click();
    await expect(options).toContainText("Estimated delivery cost: $0.00");
  } finally {
    await sql`delete from shipping_zones where id=${zone!.id}`;
  }
});

test("account and recovery forms provide inline guidance in both languages", async ({
  page,
}) => {
  for (const locale of ["en", "zh"]) {
    const t =
      locale === "zh"
        ? {
            signIn: "安全登录",
            sendRecovery: "发送恢复链接",
            required: "请填写此项。",
          }
        : {
            signIn: "Sign in securely",
            sendRecovery: "Send recovery link",
            required: "Complete this field.",
          };
    await page.goto(`/${locale}/account`);
    await page.getByRole("button", { name: t.signIn, exact: true }).click();
    const email = page.locator("#auth-email");
    await expect(email).toBeFocused();
    await expect(email).toHaveAccessibleDescription(t.required);
    await page.goto(`/recover?locale=${locale}`);
    await page
      .getByRole("button", { name: t.sendRecovery, exact: true })
      .click();
    const recoveryEmail = page.locator('input[name="email"]');
    await expect(recoveryEmail).toBeFocused();
    await expect(recoveryEmail).toHaveAccessibleDescription(t.required);
  }
});

test("authorized order pages show the fulfillment address and recorded tracking reference", async ({
  page,
  sql,
}) => {
  const order = await checkout(page, sql);
  await sql`update order_fulfillments set carrier='Synthetic carrier',tracking_number='UX-123456789',status='shipped' where order_id=${order.id}`;
  await page.reload();
  const details = page.getByRole("region", { name: "Fulfillment & Details" });
  await expect(details).toContainText("1 Test Street");
  await expect(details).toContainText("Synthetic carrier");
  await expect(details).toContainText("UX-123456789");
  await expect(
    details.getByRole("button", { name: "Copy tracking number", exact: true }),
  ).toBeVisible();
  await sql`update orders set shipping_address_snapshot='{"country":"US","address":"42 Corrected Street","city":"Oakland","region":"CA","postalCode":"94612"}'::jsonb where id=${order.id}`;
  await page.reload();
  await expect(details).toContainText("42 Corrected Street");
  await expect(details).not.toContainText("1 Test Street");
});
