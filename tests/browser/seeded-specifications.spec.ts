import { test, expect } from "./fixtures";

test("initial seed exposes descriptive specifications in English and Chinese", async ({
  page,
}, testInfo) => {
  for (const locale of ["en", "zh"]) {
    await page.goto(`/${locale}/products/studio-cup`);
    const specs = page.locator(".product-key-specs");
    await expect(specs.locator("dt")).toHaveText(
      locale === "en"
        ? ["Material", "Capacity", "Weight", "Care instructions"]
        : ["材质", "容量", "重量", "保养说明"],
    );
    await expect(specs.locator("dd")).toHaveText(
      locale === "en"
        ? ["Porcelain", "350 ml", "320 g", "Dishwasher safe"]
        : ["瓷器", "350 毫升", "320 克", "可用洗碗机清洗"],
    );
    await expect(page.locator(".product-purchase-info form")).not.toContainText(
      locale === "en" ? "Care instructions" : "保养说明",
    );
    await page.screenshot({
      path: testInfo.outputPath(`seeded-specifications-${locale}.png`),
      fullPage: true,
    });
  }
  await page.goto("/en/products/everyday-shirt");
  await expect(page.locator(".product-key-specs")).toContainText("100% cotton");
  await expect(page.locator(".product-purchase-info form")).toContainText(
    "Color",
  );
});

test("seeded specs match the apparel and accessories catalog", async ({
  sql,
}) => {
  expect(
    await sql`select code from attributes where code in ('calories','sugar-free','serving-size')`,
  ).toHaveLength(0);
  expect(
    await sql`select handle from products where handle='oat-crackers'`,
  ).toHaveLength(0);
});
