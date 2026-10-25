import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "./fixtures";

test("homepage shows only selected products and routes shoppers to search and mixed filters", async ({
  page,
  sql,
}, testInfo) => {
  const [original] = await sql`select storefront_hero from store_settings`;
  const products =
    await sql`select id,handle from products where handle in ('studio-cup','market-tote') order by handle`;
  const [category] =
    await sql`select c.slug from categories c join product_categories pc on pc.category_id=c.id join products p on p.id=pc.product_id where p.handle='studio-cup' limit 1`;
  const [collection] =
    await sql`insert into product_collections(handle,title,is_published) values(${`home-${randomUUID()}`},'Home fixture',true) returning id,handle`;
  await sql`insert into product_collection_memberships(collection_id,product_id) values(${collection!.id},${products[1]!.id})`;
  try {
    await sql`update store_settings set storefront_hero=${sql.json({ ...original!.storefront_hero, featuredProductIds: products.map((item) => item.id) })}`;
    for (const locale of ["en", "zh"]) {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/${locale}`);
      await expect(
        page.getByRole("heading", {
          name: locale === "en" ? "Selected products" : "精选商品",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.locator(".home-products .storefront-product-card"),
      ).toHaveCount(2);
      for (let index = 0; index < products.length; index++)
        await expect(
          page.locator(".storefront-product-card > a").nth(index),
        ).toHaveAttribute(
          "href",
          `/${locale}/products/${products[index]!.handle}`,
        );
      await expect(
        page.locator(
          ".home-product-section,.catalog-category-nav,.catalog-collection-nav,.catalog-desktop-filters,.catalog-mobile-filters,.catalog-sort-form",
        ),
      ).toHaveCount(0);
      await expect(
        page.getByRole("textbox", {
          name: locale === "en" ? "Search products" : "搜索商品",
          exact: true,
        }),
      ).toHaveCount(0);
      await page.screenshot({
        path: testInfo.outputPath(`selected-home-${locale}-mobile.png`),
        fullPage: true,
      });
      const scan = await new AxeBuilder({ page }).analyze();
      expect(
        scan.violations.filter((issue) =>
          ["serious", "critical"].includes(issue.impact ?? ""),
        ),
      ).toEqual([]);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/en");
    await page.screenshot({
      path: testInfo.outputPath("selected-home-desktop.png"),
      fullPage: true,
    });
    await page
      .getByRole("link", { name: "Shop all products", exact: false })
      .click();
    await page
      .getByRole("textbox", { name: "Search products", exact: true })
      .fill("cup");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    const filters = page.locator(".catalog-desktop-filters");
    await filters
      .locator('[name="collection"]')
      .selectOption(collection!.handle);
    await filters.locator('[name="category"]').selectOption(category!.slug);
    await filters
      .getByRole("button", { name: "Apply filters", exact: true })
      .click();
    await expect(page).toHaveURL(
      new RegExp("collection=" + collection!.handle),
    );
    expect(new URL(page.url()).searchParams.get("q")).toBe("cup");
    expect(new URL(page.url()).searchParams.get("category")).toBe(
      category!.slug,
    );
    await expect(page.locator(".storefront-product-card h3")).toHaveText([
      "Studio cup",
    ]);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: /^Filters/ }).click();
    await expect(
      page.getByRole("dialog").locator('[name="collection"]'),
    ).toBeVisible();
    await expect(
      page.getByRole("dialog").locator('[name="category"]'),
    ).toBeVisible();
  } finally {
    await sql`update store_settings set storefront_hero=${sql.json(original!.storefront_hero)}`;
    await sql`delete from product_collections where id=${collection!.id}`;
  }
});

test("homepage defaults to six newest published products and moves legacy filters to the products page", async ({
  page,
  sql,
}) => {
  const [original] = await sql`select storefront_hero from store_settings`;
  const token = randomUUID();
  const ids: string[] = [];
  try {
    for (let index = 0; index < 8; index++) {
      const [row] =
        await sql`insert into products(handle,title,is_published,created_at,is_pinned,sort_order) values(${`latest-${token}-${index}`},${`Latest ${index}`},${index !== 7},${new Date(Date.UTC(2035, 0, index + 1)).toISOString()},${index === 0},${index}) returning id`;
      ids.push(row!.id);
    }
    await sql`update store_settings set storefront_hero=${sql.json({ ...original!.storefront_hero, featuredProductIds: [] })}`;
    await page.goto("/en");
    await expect(
      page.getByRole("heading", { name: "Latest products", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".storefront-product-card h3")).toHaveText([
      "Latest 6",
      "Latest 5",
      "Latest 4",
      "Latest 3",
      "Latest 2",
      "Latest 1",
    ]);
    await page.goto("/en?q=cup&sort=price-low");
    await expect(page).toHaveURL(/\/en\/search\?q=cup&sort=price-low$/);
    await expect(
      page.getByRole("textbox", { name: "Search products", exact: true }),
    ).toHaveValue("cup");
  } finally {
    await sql`update store_settings set storefront_hero=${sql.json(original!.storefront_hero)}`;
    if (ids.length) await sql`delete from products where id in ${sql(ids)}`;
  }
});
