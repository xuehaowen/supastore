import { test, expect } from "./fixtures";
test.skip(
  process.env.STOREFRONT_TESTS !== "true",
  "Requires the separate storefront fixture.",
);

test("public sitemap index links bounded bilingual product pages", async ({
  page,
}) => {
  const index = await page.request.get("/sitemap.xml");
  expect(index.status()).toBe(200);
  expect(index.headers()["content-type"]).toContain("application/xml");
  expect(await index.text()).toContain("/sitemaps/1.xml");
  const shard = await page.request.get("/sitemaps/1.xml");
  expect(shard.status()).toBe(200);
  const xml = await shard.text();
  expect(xml).toContain("/en/products/everyday-shirt");
  expect(xml).toContain("/zh/products/everyday-shirt");
  expect(xml).toContain('hreflang="x-default"');
  expect((xml.match(/<url>/g) || []).length).toBeLessThanOrEqual(2002);
  expect((await page.request.get("/sitemaps/0.xml")).status()).toBe(404);
  expect((await page.request.get("/sitemaps/99999999.xml")).status()).toBe(404);
});
