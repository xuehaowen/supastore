import { test, expect, checkout } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";

test("payment reference copy failure is visible and can be retried without another order", async ({ page, sql }) => {
  const order = await checkout(page, sql);
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("denied"); } } }));
  await page.getByRole("button", { name: "Copy payment reference", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Copy unavailable" })).toBeVisible();
  await expect(page.getByText(order.reference_code, { exact: true }).first()).toBeVisible();
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => {} } }));
  await page.getByRole("button", { name: "Copy payment reference", exact: true }).click();
  await expect(page.getByRole("button", { name: "Copied", exact: true })).toBeVisible();
  await expect(page.getByText("Copy unavailable", { exact: false })).toHaveCount(0);
  const [row] = await sql`select count(*)::int as count from orders where id=${order.id}`;
  expect(row!.count).toBe(1);
});

test("mobile and desktop shop keep merchant identity, products and controls usable", async ({ page, sql }, info) => {
  const [store] = await sql`select store_name from store_settings limit 1`;
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const locale of ["en", "zh"]) {
      await page.goto("/" + locale);
      await page.screenshot({ path: info.outputPath(`home-${locale}-${width}.png`), fullPage: true });
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(store!.store_name);
      await expect(page.locator(".storefront-product-card").first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      await page.getByRole("textbox", { name: /Search|搜索/ }).fill("studio");
      await page.getByRole("button", { name: /Search|搜索/ }).click();
      await expect(page).toHaveURL(/search\?.*q=studio/);
      await expect(page.locator(".storefront-product-card").first()).toBeVisible();
    }
  }
  const scan = await new AxeBuilder({ page }).analyze();
  expect(scan.violations.filter(v => ["critical", "serious"].includes(v.impact ?? ""))).toEqual([]);
});
