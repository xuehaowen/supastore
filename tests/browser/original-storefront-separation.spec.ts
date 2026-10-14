import { test, expect, checkout } from "./fixtures";
import { randomUUID } from "node:crypto";

test("backend serves admin and APIs while the original customer pages live on storefront", async ({
  page,
  request,
}) => {
  const backend = process.env.BACKEND_URL || "http://localhost:3102";
  expect((await request.get(`${backend}/en`)).status()).toBe(404);
  const root = await request.get(backend, { maxRedirects: 0 });
  expect(root.headers().location).toMatch(/\/admin$/);
  expect((await request.get(`${backend}/api/health/live`)).ok()).toBe(true);
  await page.goto("/en");
  await expect(page.locator("#collection")).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Categories" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "中文", exact: true }),
  ).toBeVisible();
  const admin = await page.goto("/admin/login");
  expect(admin?.ok()).toBe(true);
  await expect(page.getByRole("button", { name: /Sign in/i })).toBeVisible();
});

test("original UI creates a quote and order through backend APIs and retains private cookies", async ({
  page,
  sql,
  browser,
  request,
}) => {
  const order = await checkout(page, sql);
  await expect(
    page.getByRole("heading", { name: order.reference_code, exact: true }),
  ).toBeVisible();
  const jar = await page.context().cookies();
  expect(jar.find((cookie) => cookie.name === "shop-cart")?.httpOnly).toBe(
    true,
  );
  expect(
    jar.find((cookie) => cookie.name === `shop-order-${order.id}`)?.httpOnly,
  ).toBe(true);
  const isolated = await browser.newContext();
  try {
    const response = await isolated.request.get(
      `${process.env.PLAYWRIGHT_BASE_URL}/api/v1/customer-pages/order?locale=en&id=${order.id}`,
    );
    expect(response.status()).toBe(401);
    const [quote] = await sql`select quote_id from orders where id=${order.id}`;
    const foreign = await isolated.request.get(
      `${process.env.PLAYWRIGHT_BASE_URL}/api/v1/customer-pages/checkout?locale=en&quote=${quote!.quote_id}`,
    );
    const payload = await foreign.json();
    expect(payload.data.savedQuote).toBeUndefined();
    expect(foreign.headers()["cache-control"]).toContain("no-store");
  } finally {
    await isolated.close();
  }
  expect(
    (
      await request.get(
        `/api/v1/customer-pages/order?locale=en&id=${randomUUID()}`,
      )
    ).status(),
  ).toBe(401);
});

test("original category, content, account, Chinese UI and missing pages are served by storefront", async ({
  page,
  sql,
}) => {
  await sql`update store_settings set public_content='{"en":{"about":"Original store information"},"zh":{"about":"商店介绍"}}'::jsonb`;
  await page.goto("/en/pages/about");
  await expect(page.getByText("Original store information")).toBeVisible();
  await page.goto("/en/categories/everyday");
  // Category fixtures can vary; a missing category must be an actual 404 page.
  await expect(page.locator("main h1")).toBeVisible();
  await page.goto("/en/account");
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await page.goto("/zh/products/studio-cup");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh");
  await expect(
    page.getByRole("button", { name: "加入购物袋", exact: true }),
  ).toBeVisible();
  const missing = await page.goto("/en/products/does-not-exist");
  expect(missing?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: /not found/i })).toBeVisible();
});
