import { test, expect } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";
import { openOrder, clickAction } from "./fixtures";
test("C1-C6 storefront, persistent cart, order, refresh and direct upload", async ({
  page,
  sql,
}) => {
  const [store] = await sql`select store_name from store_settings limit 1`;
  await page.goto("/en");
  await expect(
    page.getByRole("heading", { name: store!.store_name, exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Everyday shirt" }).click();
  await page.getByRole("button", { name: "Add to bag" }).click();
  await expect(page.getByRole("heading", { name: "Your bag" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Your bag" })).toBeVisible();
  await expect(page.getByText("Everyday shirt", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Continue to checkout" }).click();
  await page.getByLabel("Street address").fill("1 Test Street");
  await page
    .getByLabel("Payment method")
    .selectOption({ label: "Demo bank transfer" });
  await page.getByRole("button", { name: "Review your order" }).click();
  await expect(
    page.getByText("Payment instructions", { exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Your name").fill("Test Customer");
  await page.getByLabel("Email address").fill("customer@example.test");
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Accept total & place order" })
    .click();
  await expect(
    page.getByText("Payment instructions", { exact: true }),
  ).toBeVisible();
  const url = page.url();
  await page.reload();
  expect(page.url()).toBe(url);
  await expect(
    page.getByText("Payment instructions", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Payment image", { exact: false }).setInputFiles({
    name: "proof.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await page
    .getByRole("button", { name: "Upload evidence", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText(
    "Evidence received. This is not a payment receipt.",
  );
  const scan = await new AxeBuilder({ page }).analyze();
  expect(
    scan.violations.filter((v) =>
      ["critical", "serious"].includes(v.impact ?? ""),
    ),
  ).toEqual([]);
});
test("C1 language and C8 generic recovery response", async ({ page, sql }) => {
  const [store] = await sql`select store_name from store_settings limit 1`;
  await page.goto("/zh");
  await expect(
    page.getByRole("heading", { name: store!.store_name, exact: true }),
  ).toBeVisible();
  await page.goto("/recover");
  await page.getByLabel("Email", { exact: true }).fill("nobody@example.test");
  await page.getByLabel("Payment reference").fill("SP-NOTFOUND");
  await page.getByRole("button", { name: "Send recovery link" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "If an order was found, a recovery link has been sent.",
  );
});
test("M1/M2/M6 owner admin, pause and mobile accessibility", async ({
  page,
}) => {
  await page.goto("/admin/login");
  await page.getByLabel("Email", { exact: true }).fill("owner@example.test");
  await page.getByLabel("Password").fill(process.env.DEMO_OWNER_PASSWORD!);
  await page
    .getByRole("button", { name: "Sign in securely", exact: true })
    .click();
  await expect(page).toHaveURL(/admin(?:\/setup)?$/);
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Launch checklist" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Pause new orders" }).click();
  await expect(
    page.getByRole("button", { name: "Resume new orders" }),
  ).toBeVisible();
  await page.goto("/en");
  await expect(
    page.getByText("The store is currently paused. Please check back soon."),
  ).toBeVisible();
  await page.goto("/admin");
  await page.getByRole("button", { name: "Resume new orders" }).click();
  await expect(
    page.getByRole("button", { name: "Pause new orders" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 360, height: 780 });
  await expect(page.locator("body")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  const scan = await new AxeBuilder({ page }).analyze();
  expect(
    scan.violations.filter((v) =>
      ["critical", "serious"].includes(v.impact ?? ""),
    ),
  ).toEqual([]);
  await page.screenshot({
    path: "test-results/admin-mobile.png",
    fullPage: true,
  });
});
test("public pages have no serious accessibility issues at 360px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 780 });
  for (const path of [
    "/en",
    "/en/products/studio-cup",
    "/en/cart",
    "/en/checkout",
    "/recover",
  ]) {
    await page.goto(path);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBeTruthy();
    const scan = await new AxeBuilder({ page }).analyze();
    expect(
      scan.violations.filter((v) =>
        ["critical", "serious"].includes(v.impact ?? ""),
      ),
      path,
    ).toEqual([]);
  }
  await page.goto("/en");
  await page.screenshot({
    path: "test-results/storefront-mobile.png",
    fullPage: true,
  });
});

test("C8-C10 recovery, proposal acceptance and failed email visibility", async ({
  page,
  browser,
}) => {
  await page.goto("/en/products/studio-cup");
  await page.getByRole("button", { name: "Add to bag" }).click();
  await page.getByRole("link", { name: "Continue to checkout" }).click();
  await page.getByLabel("Street address").fill("1 Test Street");
  await page
    .getByLabel("Payment method")
    .selectOption({ label: "Demo bank transfer" });
  await page.getByRole("button", { name: "Review your order →" }).click();
  await page.getByLabel("Your name").fill("Proposal Customer");
  await page.getByLabel("Email address").fill("proposal@example.test");
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Accept total & place order" })
    .click();
  await expect(
    page.getByText("Payment instructions", { exact: true }),
  ).toBeVisible();
  const url = page.url();
  const reference = await page.locator("h1").innerText();
  const orderId = new URL(url).pathname.split("/").pop()!;
  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  await admin.goto("/admin/login");
  await admin.getByLabel("Email", { exact: true }).fill("owner@example.test");
  await admin.getByLabel("Password").fill(process.env.DEMO_OWNER_PASSWORD!);
  await admin
    .getByRole("button", { name: "Sign in securely", exact: true })
    .click();
  await expect(admin).toHaveURL(/admin(?:\/setup)?$/);
  const row = await openOrder(admin, reference);
  await row.getByLabel("Proposed total (USD)").fill("25.00");
  await row
    .getByLabel("Reason", { exact: true })
    .fill("Synthetic price adjustment");
  await clickAction(
    admin,
    row.getByRole("button", { name: "Propose new terms" }),
  );
  await expect(admin).toHaveURL(/\/admin\/orders(?:\?[^#]*)?$/);
  await page.reload();
  await expect(
    page.getByRole("alert").getByText("Order Terms Updated", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Payment instructions", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Accept New Total" }).click();
  await expect(
    page.getByText("Payment instructions", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("$25.00", { exact: true }).first()).toBeVisible();
  if (!process.env.DATABASE_URL?.includes("supastore_"))
    throw new Error("Browser fixtures require an isolated DATABASE_URL.");
  const { default: postgres } = await import("postgres");
  const sql = postgres(process.env.DATABASE_URL);
  try {
    await sql.unsafe(
      "update event_deliveries set status='exhausted' where event_id in (select id from outbox_events where aggregate_id=$1)",
      [orderId],
    );
    await admin.goto("/admin");
    await expect(admin.locator("#emails")).toContainText("exhausted");
    await page.reload();
    await expect(
      page.getByText("Payment instructions", { exact: true }),
    ).toBeVisible();
    const recoveryContext = await browser.newContext();
    const recovery = await recoveryContext.newPage();
    await recovery.goto(url);
    await expect(recovery).toHaveURL(/recover/);
    await recovery
      .getByLabel("Email", { exact: true })
      .fill("proposal@example.test");
    await recovery.getByLabel("Payment reference").fill(reference);
    await recovery.getByRole("button", { name: "Send recovery link" }).click();
    await expect(recovery.getByRole("status")).toBeVisible();
    const [event] = await sql.unsafe(
      "select payload from outbox_events where aggregate_id=$1 and event_type='order.access_recovery' order by sequence desc limit 1",
      [orderId],
    );
    await recovery.goto(event!.payload.recoveryUrl);
    await recovery.reload();
    await recovery.getByRole("button", { name: "Continue to order" }).click();
    await expect(
      recovery.getByRole("heading", { name: reference }),
    ).toBeVisible();
    await recoveryContext.close();
    const replayContext = await browser.newContext();
    try {
      const replay = await replayContext.newPage();
      await replay.goto(event!.payload.recoveryUrl);
      await replay.getByRole("button", { name: "Continue to order" }).click();
      await expect(replay).toHaveURL(/recover\?.*error=/);
      await replay.goto(url);
      await expect(replay).toHaveURL(/recover/);
    } finally {
      await replayContext.close();
    }
  } finally {
    await sql.end();
    await adminContext.close();
  }
});

test("M2/C3/C7 publish variants, free pickup checkout and availability", async ({
  page,
  browser,
}) => {
  await page.goto("/admin/login");
  await page.getByLabel("Email", { exact: true }).fill("owner@example.test");
  await page.getByLabel("Password").fill(process.env.DEMO_OWNER_PASSWORD!);
  await page
    .getByRole("button", { name: "Sign in securely", exact: true })
    .click();
  await expect(page).toHaveURL(/admin(?:\/setup)?$/);
  await page.goto("/admin/products");
  await page.waitForLoadState("networkidle");
  const handle = "browser-gift-" + Date.now();
  const title = "Browser gift " + Date.now();
  await page.getByRole("button", { name: "Add product", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByLabel("URL handle", { exact: true }).fill(handle);
  await page.getByLabel("SKU", { exact: true }).fill(handle);
  await page.getByLabel("Price in minor units", { exact: true }).fill("0");
  await page
    .getByRole("button", { name: "Publish product", exact: true })
    .click();
  await expect(page.getByRole("row").filter({ hasText: title })).toBeVisible();
  const context = await browser.newContext();
  const customer = await context.newPage();
  await customer.goto("/en/products/" + handle);
  await customer.getByRole("button", { name: "Add to bag" }).click();
  await customer.getByRole("link", { name: "Continue to checkout" }).click();
  await customer.getByLabel("Local pickup", { exact: true }).check();
  await customer.locator('input[name="pickupLocationId"]').first().check();
  await customer
    .getByRole("button", { name: "Next week", exact: true })
    .click();
  await customer
    .getByRole("button", { name: "Previous week", exact: true })
    .click();
  await customer.getByRole("button", { name: /Monthly view/ }).click();
  await customer.getByRole("button", { name: /Weekly view/ }).click();
  await customer.getByRole("button", { name: /Monthly view/ }).click();
  await customer
    .getByRole("button", { name: "Next month", exact: true })
    .click();
  await customer
    .getByRole("button", { name: "Previous month", exact: true })
    .click();
  await customer.reload();
  await customer.getByLabel("Local pickup", { exact: true }).check();
  await customer.locator('input[name="pickupLocationId"]').first().check();
  await customer
    .locator("button.pickup-calendar-day-btn:not([disabled])")
    .first()
    .click();
  const pickupTime = customer.locator('select[name="pickupTime"]');
  await expect(pickupTime.locator('option:not([value=""])')).toHaveCount(1);
  await expect(pickupTime).toBeEnabled();
  await pickupTime.selectOption({ index: 1 });
  await expect(pickupTime).not.toHaveValue("");
  await customer.getByRole("button", { name: /Review your order/ }).click();
  await customer.getByLabel("Your name").fill("Free Customer");
  await customer.getByLabel("Email address").fill("free@example.test");
  await customer.getByRole("checkbox").check();
  await customer
    .getByRole("button", { name: /Accept total & place order/ })
    .click();
  await expect(
    customer.getByText("No payment or payment evidence is required."),
  ).toBeVisible();
  await expect(customer.getByText(/confirmed/i).first()).toBeVisible();
  const row = page.getByRole("row").filter({ hasText: title });
  await row.getByRole("link", { name: "Edit", exact: true }).click();
  await page.getByLabel("Select all variants", { exact: true }).check();
  await page.getByLabel("New availability").selectOption("false");
  await page.getByRole("button", { name: "Review bulk changes" }).click();
  await clickAction(
    page,
    page.getByRole("button", { name: "Apply bulk changes" }),
  );
  await expect(
    page.getByRole("row", { name: "Default", exact: true }),
  ).toContainText("Unavailable");
  await customer.goto("/en/products/" + handle);
  await expect(
    customer.getByRole("button", { name: "Currently unavailable" }),
  ).toBeDisabled();
  await context.close();
});
