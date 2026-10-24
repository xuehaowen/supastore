import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { test, expect, clientHeaders } from "./fixtures";

test("sorting retains a usable form when JavaScript is disabled", async ({
  browser,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3103",
    extraHTTPHeaders: clientHeaders(),
  });
  try {
    const page = await context.newPage();
    await page.goto("/en/search?q=cup");
    await page
      .getByRole("combobox", { name: "Sort", exact: true })
      .selectOption("price-high");
    await page
      .getByRole("button", { name: "Apply sorting", exact: true })
      .click();
    await expect(page).toHaveURL(/q=cup.*sort=price-high/);
    await expect(page.locator(".storefront-product-grid article")).toHaveCount(
      1,
    );
  } finally {
    await context.close();
  }
});

test("key specifications appear beside purchase controls with access to the full list", async ({
  page,
  sql,
}) => {
  const handle = `spec-${randomUUID()}`;
  const [product] =
    await sql`insert into products(handle,title,is_published) values(${handle},'Specification example',true) returning id`;
  await sql`insert into product_variants(product_id,sku,title,price_cents) values(${product!.id},${handle},'Default',1000)`;
  for (let i = 1; i <= 5; i++) {
    const [attribute] =
      await sql`insert into attributes(code,name) values(${`${handle}-${i}`},${`Detail ${i}`}) returning id`;
    const [value] =
      await sql`insert into attribute_values(attribute_id,code,label) values(${attribute!.id},'value',${`Value ${i}`}) returning id`;
    await sql`insert into product_specifications(product_id,attribute_id,attribute_value_id,sort_order) values(${product!.id},${attribute!.id},${value!.id},${i})`;
  }
  await page.goto(`/en/products/${handle}`);
  const specs = page.locator(".product-purchase-info .product-key-specs");
  await expect(specs.locator("dt")).toHaveCount(4);
  await expect(specs).toContainText("Detail 1");
  await specs.getByRole("link", { name: "View all specifications" }).click();
  await expect(page.locator("#all-specifications")).toBeInViewport();
  await expect(page.locator("#all-specifications dt")).toHaveCount(5);
});

test("sort applies independently, preserves search and resets pagination", async ({
  page,
  sql,
}) => {
  const token = `browse-${randomUUID()}`;
  for (let i = 1; i <= 26; i++) {
    const [product] =
      await sql`insert into products(handle,title,is_published) values(${`${token}-${i}`},${`${token} item ${i}`},true) returning id`;
    await sql`insert into product_variants(product_id,sku,title,price_cents,is_available) values(${product!.id},${`${token}-${i}`},'Default',${i * 100},true)`;
  }
  await page.goto(`/en/search?q=${token}&page=2`);
  const pagination = page.getByRole("navigation", { name: "Product pages" });
  await expect(pagination).toContainText("Page 2 of 2");
  await expect(pagination).toContainText("Showing 25–26 of 26 products");
  await page
    .getByRole("combobox", { name: "Sort", exact: true })
    .selectOption("price-high");
  await expect(page).toHaveURL(new RegExp(`q=${token}.*sort=price-high`));
  expect(new URL(page.url()).searchParams.has("page")).toBe(false);
  await expect(pagination).toContainText("Page 1 of 2");
  await expect(page.locator(".storefront-product-grid h3").first()).toHaveText(
    `${token} item 26`,
  );
  await page.goto(`/en/search?q=${token}&sort=price-high&page=999`);
  await expect(pagination).toContainText("Page 2 of 2");
  expect(new URL(page.url()).searchParams.get("page")).toBe("2");
  await expect(page.locator(".catalog-page-position")).not.toContainText(
    "23953",
  );
  const [cup] = await sql`select id from products where handle='studio-cup'`;
  const [facet] =
    await sql`insert into attributes(code,name,kind) values(${token},'Browsing fixture','variant') returning id`;
  try {
    await sql`insert into attribute_values(attribute_id,code,label) values(${facet!.id},'choice','Choice')`;
    await sql`insert into product_options(product_id,attribute_id) values(${cup!.id},${facet!.id})`;
    await page.goto(
      `/en/search?q=cup&options=${token}:missing&sort=price-high`,
    );
    await page.locator(".catalog-desktop-filters a").click();
    await expect
      .poll(() => new URL(page.url()).searchParams.has("options"))
      .toBe(false);
    expect(new URL(page.url()).searchParams.get("q")).toBe("cup");
    expect(new URL(page.url()).searchParams.get("sort")).toBe("price-high");
  } finally {
    await sql`delete from product_options where product_id=${cup!.id} and attribute_id=${facet!.id}`;
    await sql`delete from attribute_values where attribute_id=${facet!.id}`;
    await sql`delete from attributes where id=${facet!.id}`;
  }
});

test("empty search offers usable category recovery in both languages", async ({
  page,
}) => {
  for (const locale of ["en", "zh"]) {
    await page.goto(
      `/${locale}/search?q=unfindable-${randomUUID()}&sort=price-low`,
    );
    const categories = page.getByRole("navigation", {
      name: locale === "en" ? "Browse by category" : "按分类浏览",
    });
    await expect(categories).toBeVisible();
    await categories.getByRole("link").first().click();
    await expect(
      page.locator(".storefront-product-grid article").first(),
    ).toBeVisible();
    expect(new URL(page.url()).searchParams.has("q")).toBe(false);
    expect(new URL(page.url()).searchParams.get("sort")).toBe("price-low");
  }
});

test("mobile bag puts items and checkout before delivery estimates", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/en/products/studio-cup");
  await page.getByRole("button", { name: "Add to bag", exact: true }).click();
  await page.getByRole("link", { name: "View bag", exact: true }).click();
  const item = await page
    .getByRole("heading", { name: "Studio cup", exact: true })
    .boundingBox();
  const checkout = await page
    .getByRole("link", { name: "Continue to checkout", exact: true })
    .boundingBox();
  const options = await page
    .getByRole("region", { name: "Shopping options" })
    .boundingBox();
  expect(item!.y).toBeLessThan(options!.y);
  expect(checkout!.y).toBeLessThan(options!.y);
  await page.screenshot({
    path: info.outputPath("bag-mobile.png"),
    fullPage: true,
  });
});

test("recently viewed is localized, excludes the current product and can be cleared", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/en/products/studio-cup");
  await page.goto("/en/products/market-tote");
  const recent = page.getByRole("region", {
    name: "Recently viewed",
    exact: true,
  });
  await expect(recent.getByRole("link", { name: "Studio cup" })).toBeVisible();
  await expect(recent.getByRole("link")).toHaveCount(1);
  await recent.getByRole("link").click();
  await expect(recent.getByRole("link")).toHaveCount(1);
  await expect(recent).toContainText("Market tote");
  const scan = await new AxeBuilder({ page }).analyze();
  expect(
    scan.violations.filter((item) =>
      ["serious", "critical"].includes(item.impact ?? ""),
    ),
  ).toEqual([]);
  await page.screenshot({
    path: info.outputPath("product-mobile.png"),
    fullPage: true,
  });
  await recent.getByRole("button", { name: "Clear recently viewed" }).click();
  await expect(recent).toHaveCount(0);
  await page.reload();
  await expect(recent).toHaveCount(0);
  await page.goto("/zh/products/market-tote");
  await expect(page.locator(".recently-viewed")).toHaveCount(0);
  await page.goto("/zh/products/studio-cup");
  await expect(
    page.getByRole("region", { name: "最近浏览", exact: true }),
  ).toBeVisible();
});
