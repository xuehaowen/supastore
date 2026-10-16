import {
  test as base,
  expect,
  type Page,
  type Locator,
} from "@playwright/test";
import postgres from "postgres";
import { randomUUID } from "node:crypto";
export function clientHeaders() {
  const seed = randomUUID().replaceAll("-", "");
  const ip = `198.18.${Number.parseInt(seed.slice(0, 2), 16)}.${Number.parseInt(seed.slice(2, 4), 16)}`;
  // Independent synthetic customers must not share the production sign-in rate bucket.
  return {
    "x-forwarded-for": ip,
    ...(process.env.STOREFRONT_TESTS === "true" && process.env.EDGE_PROXY_SECRET
      ? {
          "x-supastore-edge-token": process.env.EDGE_PROXY_SECRET,
          "x-supastore-client-ip": ip,
        }
      : {}),
  };
}
export const test = base.extend<{
  sql: ReturnType<typeof postgres>;
  admin: Page;
}>({
  page: async ({ page }, use) => {
    await page.setExtraHTTPHeaders(clientHeaders());
    await use(page);
  },
  sql: async ({}, use) => {
    const url = new URL(process.env.DATABASE_URL ?? "http://missing");
    if (
      !/^\/supastore_cuj_\d+$/.test(url.pathname) ||
      !["localhost", "127.0.0.1"].includes(url.hostname)
    )
      throw new Error("CUJ fixtures require the isolated test-browser runner.");
    const sql = postgres(url.href);
    try {
      await use(sql);
    } finally {
      await sql.end();
    }
  },
  admin: async ({ browser, baseURL }, use) => {
    const context = await browser.newContext({
      baseURL: process.env.ADMIN_BASE_URL ?? baseURL ?? "http://localhost:3000",
      extraHTTPHeaders: clientHeaders(),
    });
    const page = await context.newPage();
    await login(page);
    try {
      await use(page);
    } finally {
      await context.close();
    }
  },
});
export { expect };
export async function deliveredLink(page: Page, email: string, path: string) {
  let link = "";
  await expect
    .poll(async () => {
      const response = await page.request.get("http://127.0.0.1:9010");
      expect(response.ok()).toBe(true);
      const messages: string[] = await response.json();
      const message = [...messages]
        .reverse()
        .find((text) => text.includes(email) && text.includes(path));
      link =
        message
          ?.match(/https?:\/\/[^\s<>"']+/g)
          ?.find((url) => new URL(url).pathname.includes(path)) ?? "";
      return Boolean(link);
    })
    .toBe(true);
  return link;
}
export async function login(page: Page, email = "owner@example.test") {
  await page.goto("/admin/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password").fill(process.env.DEMO_OWNER_PASSWORD!);
  await page
    .getByRole("button", { name: "Sign in securely", exact: true })
    .click();
  await expect(page).toHaveURL(/\/admin(?:\/setup)?$/, { timeout: 15_000 });
}
export async function freeProduct(sql: ReturnType<typeof postgres>) {
  const handle = "free-" + randomUUID();
  const [product] =
    await sql`insert into products(handle,title,is_published) values(${handle},'Free CUJ product',true) returning id`;
  await sql`insert into product_variants(product_id,sku,title,price_cents,is_available) values(${product!.id},${handle},'Default',0,true)`;
  return handle;
}
export async function checkout(
  page: Page,
  sql: ReturnType<typeof postgres>,
  options: { pickup?: boolean; free?: boolean; quantity?: number } = {},
) {
  const handle = options.free ? await freeProduct(sql) : "studio-cup";
  let pickupId: string | undefined;
  if (options.pickup) {
    const schedule = Object.fromEntries(
      ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].map((day) => [
        day,
        [["09:00", "17:00"]],
      ]),
    );
    const [location] =
      await sql`insert into pickup_location(name,address,weekly_schedule,prep_minutes,schedule_required) values(${"CUJ pickup " + randomUUID()},'Synthetic pickup counter',${JSON.stringify(schedule)}::jsonb,0,true) returning id`;
    pickupId = location!.id;
  }
  await page.goto("/en/products/" + handle);
  for (let quantity = 1; quantity < (options.quantity ?? 1); quantity++)
    await page
      .getByRole("button", { name: "Increase quantity", exact: true })
      .click();
  await page.getByRole("button", { name: "Add to bag" }).click();
  await page.getByRole("link", { name: "Continue to checkout" }).click();
  if (options.pickup) {
    await page.getByLabel("Local pickup", { exact: true }).check();
    await page
      .locator(`input[name="pickupLocationId"][value="${pickupId}"]`)
      .check();
    await page
      .locator("button.pickup-calendar-day-btn:not([disabled])")
      .first()
      .click();
    await page.locator('select[name="pickupTime"]').selectOption({ index: 1 });
  } else await page.getByLabel("Street address").fill("1 Test Street");
  if (!options.free || !options.pickup)
    await page
      .getByLabel("Payment method")
      .selectOption({ label: "Demo bank transfer" });
  await page.getByRole("button", { name: /Review your order/ }).click();
  await page.getByLabel("Your name").fill("CUJ Customer");
  await page.getByLabel("Email address").fill("cuj@example.test");
  await page.getByRole("checkbox").check();
  await clickAction(
    page,
    page.getByRole("button", { name: /Accept total & place order/ }),
  );
  await expect(page).toHaveURL(/\/en\/orders\/[0-9a-f-]+$/);
  const id = new URL(page.url()).pathname.split("/").pop()!;
  const [order] =
    await sql`select id,reference_code,purchase_total_cents,lifecycle_status from orders where id=${id}`;
  return order! as {
    id: string;
    reference_code: string;
    purchase_total_cents: number;
    lifecycle_status: string;
  };
}
export async function openOrder(admin: Page, reference: string) {
  await admin.goto(`/admin/orders?q=${encodeURIComponent(reference)}`);
  const row = admin.getByRole("row").filter({ hasText: reference });
  await expect(row).toHaveCount(1);
  const unpaid = /unpaid|cancelled/.test(await row.innerText());
  const link = row.getByRole("link", { name: "View order", exact: true });
  const target = new URL((await link.getAttribute("href"))!, admin.url());
  await link.click();
  await admin.waitForURL(target.href);
  await admin.waitForLoadState("load");
  // Legacy queue dialogs remain covered alongside the primary order workspace.
  const orderId = target.pathname.split("/").pop()!;
  await admin.goto(
    `/admin/${unpaid ? "orders" : "fulfillment"}?manage=${orderId}`,
  );
  const dialog = admin.getByRole("dialog", { name: "Manage order payment" });
  if (unpaid) {
    await expect(dialog).toBeVisible();
    return dialog;
  }
  const details = admin.locator("#ready details[open]").filter({
    has: admin.locator("summary", { hasText: reference }),
  });
  await expect(details).toHaveCount(1);
  return details;
}
export async function submit(form: Locator, name: string) {
  await clickAction(
    form.page(),
    form.getByRole("button", { name, exact: true }),
  );
}
export async function record(
  admin: Page,
  reference: string,
  amount: number,
  bankReference: string = randomUUID(),
) {
  const row = await openOrder(admin, reference);
  const form = row.locator("form").filter({
    has: admin.getByRole("button", { name: "Record receipt", exact: true }),
  });
  await form
    .getByLabel("Received amount (USD)")
    .fill((amount / 100).toFixed(2));
  await form.getByLabel("Actual bank / cash reference").fill(bankReference);
  await form.getByRole("checkbox").check();
  await submit(form, "Record receipt");
  await expect(admin).toHaveURL(/\/admin(?:\/orders)?(?:\?[^#]*)?$/);
}
export async function confirm(admin: Page, reference: string) {
  const row = await openOrder(admin, reference);
  await submit(row, "Confirm exact payment");
  await expect(admin).toHaveURL(/\/admin(?:\/orders)?(?:\?[^#]*)?$/);
}

export async function clickAction(page: Page, button: Locator) {
  const response = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).origin === new URL(page.url()).origin,
  );

  await button.click();
  const result = await response;
  const target =
    result.headers()["x-action-redirect"]?.split(";")[0] ??
    result.headers()["location"];
  if (target) {
    const expected = new URL(target, page.url());
    await page.waitForURL(
      (url) =>
        url.origin === expected.origin &&
        url.pathname === expected.pathname &&
        url.search === expected.search,
    );
    await page.goto(expected.href);
  }
}
