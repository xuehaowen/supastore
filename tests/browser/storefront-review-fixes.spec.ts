import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "./fixtures";
import { clientHeaders } from "./fixtures";

test("mobile filters remain usable without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3103",
    extraHTTPHeaders: clientHeaders(),
  });
  try {
    const page = await context.newPage();
    await page.goto("/en/search");
    const filters = page.locator(".catalog-desktop-filters");
    await expect(filters).toBeVisible();
    await filters
      .getByRole("combobox", { name: "Category", exact: true })
      .selectOption("homeware");
    await filters
      .getByRole("button", { name: "Apply filters", exact: true })
      .click();
    await expect(page).toHaveURL(/category=homeware/);
    await expect(page.locator(".storefront-product-card h3")).toHaveText([
      "Studio cup",
    ]);
  } finally {
    await context.close();
  }
});

test("catalog navigation and empty recovery open all products", async ({
  page,
}) => {
  await page.goto("/en/products/studio-cup");
  await page
    .getByRole("navigation", { name: "Shop", exact: true })
    .getByRole("link", { name: "All products", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/en\/search$/);
  await expect(
    page.locator(".catalog-category-nav,.catalog-collection-nav"),
  ).toHaveCount(0);
  await expect(page.locator("main h2")).toHaveCount(0);
  await expect(
    page.locator(".catalog-desktop-filters [name='collection']"),
  ).toBeVisible();
  await expect(
    page.locator(".catalog-desktop-filters [name='category']"),
  ).toBeVisible();
  await page.goto("/en/search?q=zzznomatch-review");
  await page
    .locator(".storefront-empty")
    .getByRole("link", { name: "All products", exact: true })
    .click();
  await expect(page).toHaveURL(/\/en\/search$/);
  await expect(page.locator(".storefront-product-card").first()).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  expect(
    (await page.locator(".storefront-product-grid").boundingBox())!.y,
  ).toBeLessThan(650);
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("link", { name: "All products", exact: true })
    .click();
  await expect(page).toHaveURL(/\/en\/search$/);
});

test("mobile quick purchase is available before scrolling and uses the selected form", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/en/products/studio-cup");
  const quick = page.locator(".mobile-purchase-bar");
  await expect(quick).toBeVisible();
  await expect(quick).toBeInViewport();
  await expect(page.locator(".product-main-image img")).not.toHaveAttribute(
    "loading",
    "lazy",
  );
  await expect(page.locator(".product-gallery img").last()).toHaveAttribute(
    "loading",
    "lazy",
  );
  await quick.getByRole("button").click();
  await expect(
    page.getByRole("link", { name: "View bag", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".storefront-mobile-actions .bag-count"),
  ).toHaveText("1");
  await page.screenshot({
    path: testInfo.outputPath("mobile-quick-purchase.png"),
    fullPage: true,
  });
  const scan = await new AxeBuilder({ page }).analyze();
  expect(
    scan.violations.filter((issue) =>
      ["serious", "critical"].includes(issue.impact ?? ""),
    ),
  ).toEqual([]);
});

test("multi-variant purchase requires a size and review shows the quoted selection", async ({
  page,
  sql,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/en/products/everyday-shirt");
  const quick = page.locator(".mobile-purchase-bar");
  await quick.getByRole("button", { name: /Choose options/ }).click();
  await expect(
    page.getByRole("link", { name: "View bag", exact: true }),
  ).toHaveCount(0);
  const size = page.getByRole("group", { name: "Size", exact: true });
  await expect(size.getByRole("button", { pressed: true })).toHaveCount(0);
  await size.getByRole("button", { name: "M", exact: true }).click();
  await page
    .getByRole("button", { name: "Increase quantity", exact: true })
    .click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(quick).toBeVisible();
  await expect(quick).toContainText("Size: M");
  await expect(quick).toContainText("Natural");
  await page.screenshot({
    path: testInfo.outputPath("mobile-selected-options.png"),
  });
  await quick.getByRole("button", { name: /Add to bag/ }).click();
  await page.getByRole("link", { name: "View bag", exact: true }).click();
  await expect(page.locator("main")).toContainText("Natural / M");
  await page.getByRole("link", { name: "Continue to checkout" }).click();
  await page.locator(".checkout-mobile-summary summary").click();
  await expect(page.locator(".checkout-mobile-summary")).toContainText(
    "Natural / M",
  );
  await page
    .getByLabel("Recipient name", { exact: true })
    .fill("Review Fixture");
  await page
    .getByLabel("Street address", { exact: true })
    .fill("12 Demo Street");
  await page.getByLabel("City", { exact: true }).fill("Oakland");
  await page.getByLabel("State / region", { exact: true }).selectOption("CA");
  await page.getByLabel("ZIP / postal code", { exact: true }).fill("94612");
  await page.getByRole("button", { name: /Review your order/ }).click();
  await expect(
    page.getByRole("link", { name: "Edit fulfillment" }),
  ).toBeVisible();
  const summary = page.getByRole("region", {
    name: "Order summary",
    exact: true,
  });
  await expect(summary).toContainText("2 × Everyday shirt — Natural / M");
  await expect(summary).toContainText("$64.00");
  const quoteId = new URL(page.url()).searchParams.get("quote");
  const [quote] = await sql`select cart_id from quotes where id=${quoteId}`;
  await sql`update cart_items set quantity=3 where cart_id=${quote!.cart_id}`;
  try {
    await page.reload();
    await expect(summary).toContainText("2 × Everyday shirt — Natural / M");
    await expect(summary).toContainText("$64.00");
    await page.screenshot({
      path: testInfo.outputPath("checkout-quoted-items.png"),
      fullPage: true,
    });
  } finally {
    await sql`update cart_items set quantity=2 where cart_id=${quote!.cart_id}`;
  }
});

test("mobile header targets fit narrow English and Chinese storefronts", async ({
  page,
}, testInfo) => {
  for (const locale of ["en", "zh"]) {
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(`/${locale}/products/everyday-shirt`);
      expect(
        await page.locator(".storefront-wordmark").evaluate((brand) => {
          const name = Array.from(brand.childNodes).find(
            (node) =>
              node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
          );
          const range = document.createRange();
          range.selectNodeContents(name!);
          return range.getClientRects().length;
        }),
      ).toBe(1);
      const targets = page.locator(
        ".storefront-mobile-actions > a, .storefront-mobile-actions > button",
      );
      for (const target of await targets.all()) {
        const bounds = await target.boundingBox();
        expect(bounds!.width).toBeGreaterThanOrEqual(44);
        expect(bounds!.height).toBeGreaterThanOrEqual(44);
        expect(bounds!.x).toBeGreaterThanOrEqual(0);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBe(width);
      await expect(
        page.locator(".product-purchase-info > details"),
      ).toHaveCount(0);
      if (width === 320)
        await page.screenshot({
          path: testInfo.outputPath(`mobile-header-${locale}.png`),
        });
    }
  }
});
