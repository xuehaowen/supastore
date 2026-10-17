import { test, expect } from "./fixtures";
import { randomUUID } from "node:crypto";

test("public metadata uses store content and correct locale canonicals", async ({ page, sql }) => {
  const [original] = await sql`select store_name,public_content from store_settings limit 1`;
  const handle = "seo-" + randomUUID();
  try {
    await sql`update store_settings set store_name='Milky Bakery fixture', public_content=${sql.json({ en: { about: "Fresh bread for our bakery customers", shipping: "Pickup and shipping details" }, zh: { about: "每日手作麵包" } })}`;
    await sql`insert into product_collections(handle,title,description,is_published) values(${handle},'Morning bakes','Fresh morning collection',true)`;
    await page.goto('/en');
    await expect(page).toHaveTitle('Milky Bakery fixture');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href','http://localhost:3103/en');
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content','Fresh bread for our bakery customers');
    await page.goto('/zh/pages/about');
    await expect(page).toHaveTitle(/Milky Bakery fixture/);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content','每日手作麵包');
    await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute('href','http://localhost:3103/en/pages/about');
    await page.goto('/en/collections/'+handle+'?page=2');
    await expect(page).toHaveTitle('Morning bakes | Milky Bakery fixture');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href','http://localhost:3103/en/collections/'+handle+'?page=2');
    await page.goto('/en/search?q=bread');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content',/noindex/);
  } finally {
    await sql`delete from product_collections where handle=${handle}`;
    await sql`update store_settings set store_name=${original!.store_name},public_content=${sql.json(original!.public_content)}`;
  }
});

test("original storefront sitemap exposes bounded bilingual child pages", async ({
  page,
}) => {
  const index = await page.request.get("/sitemap.xml");
  expect(index.status()).toBe(200);
  expect(index.headers()["content-type"]).toContain("application/xml");
  const body = await index.text();
  expect(body).toContain("<sitemapindex");
  expect(body).toContain("/sitemaps/products-1.xml");
  expect(body).toContain("/sitemaps/categories-1.xml");
  const products = await page.request.get("/sitemaps/products-1.xml");
  expect(products.status()).toBe(200);
  const urls = await products.text();
  expect(urls).toContain("/en/products/");
  expect(urls).toContain("/zh/products/");
  expect((urls.match(/<url>/g) ?? []).length).toBeLessThanOrEqual(2000);
  expect((await page.request.get("/sitemaps/static.xml")).status()).toBe(200);
  expect(
    (await page.request.get("/sitemaps/products-50000.xml")).status(),
  ).toBe(404);
  expect((await page.request.get("/sitemaps/products-0.xml")).status()).toBe(
    404,
  );
});
