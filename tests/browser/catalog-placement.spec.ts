import { randomUUID } from "node:crypto";
import { test, expect, clickAction } from "./fixtures";

test("owners pin scoped products and shoppers combine collection and category on desktop and mobile", async ({
  admin,
  page,
  sql,
}, info) => {
  const token = `mixed-${randomUUID()}`;
  const oldTitle = `${token} Original cup`;
  const newTitle = `${token} New cup`;
  const [old] =
    await sql`insert into products(handle,title,is_published,created_at) values(${`${token}-old`},${oldTitle},true,'2026-01-01') returning id`;
  const [fresh] =
    await sql`insert into products(handle,title,is_published,created_at) values(${`${token}-new`},${newTitle},true,'2026-01-02') returning id`;
  const [outside] =
    await sql`insert into products(handle,title,is_published) values(${`${token}-outside`},${`${token} Tote`},true) returning id`;
  for (const [product, price] of [
    [old!, 2000],
    [fresh!, 1000],
    [outside!, 500],
  ] as const)
    await sql`insert into product_variants(product_id,sku,title,price_cents) values(${product.id},${`${token}-${price}`},'Default',${price})`;
  const [category] =
    await sql`insert into categories(name,slug) values(${`${token} Cups`},${token}) returning id`;
  const [collection] =
    await sql`insert into product_collections(handle,title,description,is_published) values(${token},${`${token} Summer`},'An editorial selection.',true) returning id`;
  await sql`insert into product_categories(product_id,category_id) values(${old!.id},${category!.id}),(${fresh!.id},${category!.id})`;
  await sql`insert into product_collection_memberships(collection_id,product_id) values(${collection!.id},${old!.id}),(${collection!.id},${fresh!.id}),(${collection!.id},${outside!.id})`;

  await admin.goto(`/admin/products?q=${token}&sort=storefront`);
  await clickAction(
    admin,
    admin.getByRole("button", { name: `Pin ${oldTitle}`, exact: true }),
  );
  await expect(
    admin.getByRole("button", { name: `Unpin ${oldTitle}`, exact: true }),
  ).toBeVisible();
  await admin.goto(`/admin/collections/${collection!.id}`);
  await clickAction(
    admin,
    admin.getByRole("button", { name: `Pin ${oldTitle}`, exact: true }),
  );

  await page.goto(`/en/collections/${token}?category=${token}&q=${token}`);
  await expect(
    page.getByRole("heading", { name: `${token} Summer`, exact: true }),
  ).toBeVisible();
  await expect(page.getByText("An editorial selection.")).toBeVisible();
  const grid = page.locator(".storefront-product-grid");
  await expect(grid.locator("article")).toHaveCount(2);
  await expect(grid.locator("h3").first()).toHaveText(oldTitle);
  await page
    .getByRole("combobox", { name: "Sort", exact: true })
    .selectOption("price-low");
  await expect(grid.locator("h3").first()).toHaveText(newTitle);
  expect(new URL(page.url()).pathname).toBe(`/en/collections/${token}`);
  expect(new URL(page.url()).searchParams.get("category")).toBe(token);
  await page.screenshot({
    path: info.outputPath("mixed-collection-desktop.png"),
    fullPage: true,
  });

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/en/search?q=${token}&category=${token}`);
  await page.getByRole("button", { name: /^Filters/ }).click();
  const sheet = page.getByRole("dialog", { name: "Filters", exact: true });
  await sheet
    .getByRole("combobox", { name: "Collection", exact: true })
    .selectOption(token);
  await sheet
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await expect(grid.locator("article")).toHaveCount(2);
  expect(new URL(page.url()).searchParams.get("collection")).toBe(token);
  expect(new URL(page.url()).searchParams.get("category")).toBe(token);
  await expect(page.locator(".catalog-active-filters")).toContainText(
    `${token} Summer`,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("mixed-search-mobile.png"),
    fullPage: true,
  });
});
