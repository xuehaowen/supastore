import { test, expect } from "./fixtures";
import { randomUUID } from "node:crypto";

test("discovery excludes unpublished/private content and exposes authorized public images", async ({
  page,
  sql,
}) => {
  const handle = "discovery-" + randomUUID();
  const imageKey = "catalog/" + handle + ".png";
  const [product] =
    await sql`insert into products(handle,title,is_published) values(${handle},'Discovery loaf',true) returning id`;
  const [category] =
    await sql`select slug,name from categories order by id limit 1`;
  const [settings] = await sql`select store_name from store_settings limit 1`;
  try {
    await sql`insert into product_variants(product_id,sku,title,price_cents,is_available) values(${product!.id},${handle},'Default',0,true)`;
    await sql`insert into product_images(product_id,s3_key) values(${product!.id},${imageKey})`;
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAGUlEQVQokWN4+uI+SYhhVMOL0VB6OlyTBgCmaawfkFnzKAAAAABJRU5ErkJggg==",
      "base64",
    );
    expect(
      (
        await page.request.put(
          "http://127.0.0.1:9009/browser-public-fixture/" + imageKey,
          { data: png, headers: { "Content-Type": "image/png" } },
        )
      ).status(),
    ).toBe(200);
    const asset = await page.request.get(
      "/api/assets?key=" + encodeURIComponent(imageKey),
    );
    expect(asset.status()).toBe(200);
    expect(asset.headers()["content-type"]).toContain("image/png");
    await page.goto("/en/products/" + handle);
    await expect(page).toHaveTitle("Discovery loaf | " + settings!.store_name);
    const structured = JSON.parse(
      await page.locator('script[type="application/ld+json"]').innerText(),
    );
    expect(structured["@type"]).toBe("Product");
    expect(structured.name).toBe(await page.locator("main h1").innerText());
    expect(Number(structured.offers[0].price)).toBe(0);
    const robots = await page.request.get("/robots.txt");
    expect(robots.status()).toBe(200);
    expect(await robots.text()).toContain("Allow: /api/assets");
    expect(await robots.text()).toContain("Disallow: /api/");
    await page.goto("/en?page=2");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      "http://localhost:3103/en?page=2",
    );
    if (category) {
      await page.goto("/en/categories/" + category.slug);
      await expect(page).toHaveTitle(
        (await page.locator("main h1").innerText()) +
          " | " +
          settings!.store_name,
      );
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        "href",
        "http://localhost:3103/en/categories/" + category.slug,
      );
    }
    for (const path of [
      "/en/cart",
      "/en/checkout",
      "/en/account",
      "/recover",
    ]) {
      await page.goto(path);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
        "content",
        /noindex/,
      );
    }
    await sql`update products set is_published=false where id=${product!.id}`;
    expect(
      (
        await page.request.get("/en/products/" + handle, {
          headers: { "User-Agent": "Twitterbot" },
        })
      ).status(),
    ).toBe(404);
    expect(
      (
        await page.request.get(
          "/api/assets?key=" + encodeURIComponent(imageKey),
        )
      ).status(),
    ).toBe(404);
    const index = await page.request.get("/sitemap.xml");
    const locations = [
      ...(await index.text()).matchAll(/<loc>([^<]+)<\/loc>/g),
    ].map((match) => match[1]!);
    for (const location of locations) {
      const shard = await page.request.get(location);
      expect(shard.status()).toBe(200);
      const body = await shard.text();
      expect(body).not.toContain("/products/" + handle);
      expect(body).not.toMatch(
        /\/(?:account|cart|checkout|orders|admin|recover)(?:\/|<)/,
      );
    }
  } finally {
    await sql`delete from product_images where product_id=${product!.id}`;
    await sql`delete from product_variants where product_id=${product!.id}`;
    await sql`delete from products where id=${product!.id}`;
    await page.request.delete(
      "http://127.0.0.1:9009/browser-public-fixture/" + imageKey,
    );
  }
});

test("public metadata uses store content and correct locale canonicals", async ({
  page,
  sql,
}) => {
  const [original] =
    await sql`select store_name,public_content from store_settings limit 1`;
  const handle = "seo-" + randomUUID();
  try {
    await sql`update store_settings set store_name='Supastore fixture', public_content=${sql.json({ en: { about: "Curated goods for our customers", shipping: "Pickup and shipping details" }, zh: { about: "精选日用好物" } })}`;
    await sql`insert into product_collections(handle,title,description,is_published) values(${handle},'Everyday essentials','Everyday collection',true)`;
    await page.goto("/en");
    await expect(page).toHaveTitle("Supastore fixture");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      "http://localhost:3103/en",
    );
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      "Curated goods for our customers",
    );
    await page.goto("/zh/pages/about");
    await expect(page).toHaveTitle(/Supastore fixture/);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      "精选日用好物",
    );
    await expect(
      page.locator('link[rel="alternate"][hreflang="en"]'),
    ).toHaveAttribute("href", "http://localhost:3103/en/pages/about");
    await page.goto("/en/collections/" + handle + "?page=2");
    await expect(page).toHaveTitle("Everyday essentials | Supastore fixture");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      "http://localhost:3103/en/collections/" + handle + "?page=2",
    );
    await page.goto("/en/search?q=bread");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/,
    );
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
