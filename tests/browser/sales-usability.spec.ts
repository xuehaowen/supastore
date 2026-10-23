import { test, expect, checkout, freeProduct } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";

test("owner setup recommends the missing profile and keeps completed settings intact", async ({
  admin,
  sql,
}) => {
  const [original] =
    await sql`select setup_completed from store_settings limit 1`;
  try {
    await sql`update store_settings set setup_completed=false`;
    await admin.goto("/admin/setup");
    const checklist = admin.getByRole("region", { name: "Launch checklist" });
    await expect(
      checklist.getByRole("link", { name: /Complete your store profile/ }),
    ).toHaveAttribute("href", "/admin/setup#store-profile");
    await checklist
      .getByRole("link", { name: /Complete your store profile/ })
      .click();
    await expect(
      admin.getByRole("heading", { name: "Store profile & taxes" }),
    ).toBeVisible();
    await expect(
      admin.getByLabel("Store name", { exact: true }),
    ).not.toHaveValue("");
  } finally {
    await sql`update store_settings set setup_completed=${original!.setup_completed}`;
  }
});

test("sold-out variants cannot be added and Product offers match stock", async ({
  page,
  sql,
}) => {
  const handle = await freeProduct(sql);
  const [product] = await sql`select id from products where handle=${handle}`;
  const [first] =
    await sql`select id from product_variants where product_id=${product!.id}`;
  try {
    await sql`insert into variant_stock(variant_id,tracking_enabled,on_hand) values(${first!.id},true,0)`;
    const [second] =
      await sql`insert into product_variants(product_id,sku,title,price_cents,is_available) values(${product!.id},${handle + "-second"},'Available loaf',500,true) returning id`;
    await sql`insert into variant_stock(variant_id,tracking_enabled,on_hand) values(${second!.id},true,2)`;
    await page.goto("/en/products/" + handle);
    await expect(
      page.locator(`input[type=radio][value="${first!.id}"]`),
    ).toBeDisabled();
    await expect(
      page.locator(`input[type=radio][value="${second!.id}"]`),
    ).toBeChecked();
    await expect(
      page.getByRole("button", { name: "Add to bag" }),
    ).toBeEnabled();
    const structured = JSON.parse(
      await page.locator('script[type="application/ld+json"]').innerText(),
    );
    expect(
      structured.offers.find((offer: { sku: string }) => offer.sku === handle)
        .availability,
    ).toBe("https://schema.org/OutOfStock");
    await sql`update variant_stock set on_hand=0 where variant_id=${second!.id}`;
    await page.reload();
    await expect(
      page.getByRole("button", { name: /unavailable/i }),
    ).toBeDisabled();
  } finally {
    await sql`delete from variant_stock where variant_id in (select id from product_variants where product_id=${product!.id})`;
    await sql`delete from product_variants where product_id=${product!.id}`;
    await sql`delete from products where id=${product!.id}`;
  }
});

for (const label of ["Copy payment reference", "Copy exact amount"])
  test(`${label} failure is visible and can be retried without another order`, async ({
    page,
    sql,
  }) => {
    const order = await checkout(page, sql);
    await page.evaluate(() =>
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async () => {
            throw new Error("denied");
          },
        },
      }),
    );
    await page.getByRole("button", { name: label, exact: true }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Copy unavailable" }),
    ).toBeVisible();
    await expect(
      page.getByText(order.reference_code, { exact: true }).first(),
    ).toBeVisible();
    await page.evaluate(() =>
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (value: string) => {
            Object.defineProperty(window, "lastCopiedPaymentValue", {
              value,
              configurable: true,
            });
          },
        },
      }),
    );
    await page.getByRole("button", { name: label, exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Copied", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => Reflect.get(window, "lastCopiedPaymentValue")),
    ).toBe(
      label === "Copy exact amount"
        ? (order.purchase_total_cents / 100).toFixed(2)
        : order.reference_code,
    );
    await expect(
      page.getByText("Copy unavailable", { exact: false }),
    ).toHaveCount(0);
    const [row] =
      await sql`select count(*)::int as count from orders where id=${order.id}`;
    expect(row!.count).toBe(1);
  });

test("mobile and desktop shop keep merchant identity, products and controls usable", async ({
  page,
  sql,
}, info) => {
  const [store] = await sql`select store_name from store_settings limit 1`;
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const locale of ["en", "zh"]) {
      await page.goto("/" + locale);
      await page.screenshot({
        path: info.outputPath(`home-${locale}-${width}.png`),
        fullPage: true,
      });
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.locator(".storefront-wordmark")).toContainText(
        store!.store_name,
      );
      await expect(
        page.locator(".storefront-product-card").first(),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - innerWidth,
        ),
      ).toBeLessThanOrEqual(1);
      await page.getByRole("textbox", { name: /Search|搜索/ }).fill("studio");
      await page.getByRole("button", { name: /Search|搜索/ }).click();
      await expect(page).toHaveURL(/search\?.*q=studio/);
      await expect(
        page.locator(".storefront-product-card").first(),
      ).toBeVisible();
    }
  }
  const scan = await new AxeBuilder({ page }).analyze();
  expect(
    scan.violations.filter((v) =>
      ["critical", "serious"].includes(v.impact ?? ""),
    ),
  ).toEqual([]);
});
