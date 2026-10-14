import { test, expect } from "./fixtures";

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
