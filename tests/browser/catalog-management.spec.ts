import { randomUUID } from "node:crypto";
import { test, expect } from "./fixtures";

test("catalog filtering includes empty drafts and escapes literal search text", async ({
  admin,
  sql,
}) => {
  const handle = `draft-${randomUUID()}`;
  await sql`insert into products(handle,title,is_published) values(${handle},'Catalog 100% draft',false)`;
  await admin.goto("/admin/products");
  await admin.getByLabel("Search products").fill("100%");
  await admin
    .getByRole("combobox", { name: "Status", exact: true })
    .selectOption("draft");
  await admin.getByRole("button", { name: "Filter", exact: true }).click();
  const row = admin.getByRole("row").filter({ hasText: "Catalog 100% draft" });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("Not priced");
  await admin
    .getByRole("combobox", { name: "Status", exact: true })
    .selectOption("published");
  await admin.getByRole("button", { name: "Filter", exact: true }).click();
  await expect(
    admin.getByText("No products match these filters."),
  ).toBeVisible();
});

test("option preview generates combinations, excludes selections and preserves mapped variants", async ({
  admin,
  sql,
}) => {
  const code = randomUUID().replaceAll("-", "").slice(0, 8);
  await admin.goto("/admin/attributes");
  await admin
    .getByRole("button", { name: "Add attribute", exact: true })
    .click();
  const dialog = admin.getByRole("dialog", {
    name: "Add attribute",
    exact: true,
  });
  await dialog.getByLabel("Attribute name").fill(`Material ${code}`);
  await dialog
    .getByLabel("Permanent code", { exact: true })
    .fill(`material-${code}`);
  await dialog.getByRole("button", { name: "Create attribute" }).click();
  await expect(admin.getByRole("status")).toContainText("Attribute saved");
  for (const [label, valueCode] of [
    ["Cotton", "cotton"],
    ["Linen", "linen"],
  ]) {
    await admin.getByRole("button", { name: "Add value", exact: true }).click();
    const valueDialog = admin.getByRole("dialog", {
      name: `Add value · Material ${code}`,
      exact: true,
    });
    await valueDialog.getByLabel("Value label").fill(label!);
    await valueDialog.getByLabel("Permanent value code").fill(valueCode!);
    await valueDialog.getByRole("button", { name: "Create value" }).click();
    await expect(admin.getByRole("status")).toContainText("Attribute saved");
  }
  const [product] =
    await sql`insert into products(handle,title,is_published) values(${`option-product-${code}`},'Option test product',false) returning id`;
  const [legacy] =
    await sql`insert into product_variants(product_id,sku,title,price_cents) values(${product!.id},${`LEGACY-${code}`},'Existing cotton',1299) returning id`;
  await admin.goto(`/admin/products/${product!.id}/options`);
  await admin.getByLabel(`Material ${code}: Cotton`, { exact: false }).check();
  await admin.getByLabel(`Material ${code}: Linen`, { exact: false }).check();
  await admin.getByLabel("SKU prefix").fill(`TEST-${code.toUpperCase()}`);
  await admin.getByLabel("Default price in minor units").fill("1500");
  await admin.getByRole("button", { name: "Preview combinations" }).click();
  await expect(
    admin.getByRole("heading", { name: "Review 2 combinations" }),
  ).toBeVisible();
  await admin
    .getByLabel(`Map LEGACY-${code}`)
    .selectOption({ label: "Cotton" });
  await admin
    .getByRole("button", { name: "Save options & generate variants" })
    .click();
  await expect(admin.getByRole("status")).toContainText("1 variants created");
  const variants =
    await sql`select id,sku,title,price_cents,combination_key from product_variants where product_id=${product!.id} order by price_cents`;
  expect(variants).toHaveLength(2);
  expect(variants[0]!.id).toBe(legacy!.id);
  expect(variants[0]!.sku).toBe(`LEGACY-${code}`);
  expect(variants[0]!.price_cents).toBe(1299);
  expect(variants[0]!.combination_key).toBeTruthy();
  expect(variants[1]!.price_cents).toBe(1500);
  await admin.getByRole("button", { name: "Preview combinations" }).click();
  await admin
    .getByRole("button", { name: "Save options & generate variants" })
    .click();
  await expect(admin.getByRole("status")).toContainText("0 variants created");
  expect(
    (await sql`select id from product_variants where product_id=${product!.id}`)
      .length,
  ).toBe(2);
});

test("category table edits hierarchy and rejects long cycles", async ({
  admin,
  sql,
}) => {
  const code = randomUUID();
  const [root] =
    await sql`insert into categories(name,slug) values('Hierarchy root',${`root-${code}`}) returning id`;
  const [child] =
    await sql`insert into categories(name,slug,parent_id) values('Hierarchy child',${`child-${code}`},${root!.id}) returning id`;
  const [grandchild] =
    await sql`insert into categories(name,slug,parent_id) values('Hierarchy grandchild',${`grandchild-${code}`},${child!.id}) returning id`;
  await admin.goto("/admin/categories");
  await admin
    .getByRole("row")
    .filter({ hasText: `root-${code}` })
    .getByRole("button", { name: "Edit category", exact: true })
    .click();
  const dialog = admin.getByRole("dialog", {
    name: "Edit category · Hierarchy root",
  });
  await dialog.getByLabel("Parent category").selectOption(grandchild!.id);
  await dialog.getByRole("button", { name: "Save category" }).click();
  await expect(admin.locator('[data-slot="alert"]')).toContainText(
    "cannot form a cycle",
  );
});

test("merchant publishes a collection and controls membership and translations", async ({
  admin,
  page,
  sql,
}) => {
  const handle = `collection-${randomUUID()}`;
  await admin.goto("/admin/collections");
  await admin.getByRole("button", { name: "Add collection" }).click();
  const dialog = admin.getByRole("dialog", { name: "Add collection" });
  await dialog.getByLabel("Collection title").fill("Summer collection");
  await dialog.getByLabel("Collection handle").fill(handle);
  await dialog.getByLabel("Publish collection").check();
  await dialog.getByRole("button", { name: "Create collection" }).click();
  await expect(admin.getByRole("status")).toContainText("Collection saved", {
    timeout: 20000,
  });
  const [product] =
    await sql`select id from products where handle='studio-cup'`;
  await admin
    .getByRole("combobox", { name: "Product", exact: true })
    .selectOption(product!.id);
  await admin.getByRole("button", { name: "Add product", exact: true }).click();
  await page.goto(`/en/collections/${handle}`);
  await expect(
    page.getByRole("heading", { name: "Studio cup", exact: true }),
  ).toBeVisible();
  await admin.getByRole("button", { name: "Edit zh translation" }).click();
  const translation = admin.getByRole("dialog", {
    name: "Collection translation · zh",
  });
  await translation.getByLabel("Translated title").fill("夏季系列");
  await translation.getByRole("button", { name: "Save translation" }).click();
  await expect(translation).not.toBeVisible();
  await expect
    .poll(
      async () =>
        (
          await sql`select title from collection_translations where locale='zh' and collection_id=(select id from product_collections where handle=${handle})`
        )[0]?.title,
    )
    .toBe("夏季系列");
  await page.goto(`/zh/collections/${handle}`);
  await expect(page.getByRole("heading", { name: "夏季系列" })).toBeVisible();
  await admin.getByLabel("Published", { exact: true }).uncheck();
  await admin
    .getByRole("button", { name: "Save collection", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (
          await sql`select is_published from product_collections where handle=${handle}`
        )[0]?.is_published,
    )
    .toBe(false);
  const response = await page.goto(`/en/collections/${handle}`);
  expect(response!.status()).toBe(404);
});
