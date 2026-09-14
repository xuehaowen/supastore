import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { test, expect } from "./fixtures";

test("product editor saves existing variants and translations without replacing records", async ({
  admin,
  page,
  sql,
}) => {
  const handle = `edit-${randomUUID()}`;
  const [product] =
    await sql`insert into products(handle,title) values(${handle},'Editor fixture') returning *`;
  const [variant] =
    await sql`insert into product_variants(product_id,sku,title,price_cents,attributes) values(${product!.id},${handle},'Original variant',1200,'{"material":"cotton"}') returning *`;
  const [image] =
    await sql`insert into product_images(product_id,s3_key,alt_text) values(${product!.id},'fixture/old','Original image') returning *`;
  await admin.goto("/admin/products");
  await admin
    .locator("article")
    .filter({ hasText: "Editor fixture" })
    .getByRole("link", { name: "Edit product" })
    .click();
  await expect(admin.getByLabel("Title", { exact: true })).toHaveValue(
    "Editor fixture",
  );
  await admin.getByLabel("Title", { exact: true }).fill("Updated fixture");
  await admin
    .getByLabel("Description", { exact: true })
    .fill("Updated description");
  await admin.getByLabel("Variant name").fill("Updated variant");
  await admin.getByLabel("Price in minor units").fill("1750");
  await admin.getByLabel("Chinese title", { exact: true }).fill("更新商品");
  await admin
    .getByLabel("Chinese description", { exact: true })
    .fill("更新描述");
  await admin.getByLabel("Image asset key").fill("fixture/updated");
  const [category] = await sql`select id,name from categories limit 1`;
  await admin
    .getByRole("group", { name: "Categories", exact: true })
    .getByLabel(category!.name, { exact: true })
    .check();
  await admin.getByRole("button", { name: "Save changes" }).click();
  await expect(
    admin.getByRole("status").filter({ hasText: "Product changes saved" }),
  ).toBeVisible();
  const [saved] = await sql`select * from products where id=${product!.id}`;
  expect(saved!.quote_version).toBe(product!.quote_version + 1);
  expect(saved!.title).toBe("Updated fixture");
  const [savedVariant] =
    await sql`select * from product_variants where product_id=${product!.id}`;
  expect(savedVariant!.id).toBe(variant!.id);
  expect(savedVariant!.price_cents).toBe(1750);
  expect(savedVariant!.attributes).toEqual({ material: "cotton" });
  const [savedImage] =
    await sql`select * from product_images where product_id=${product!.id}`;
  expect(savedImage!.id).toBe(image!.id);
  expect(savedImage!.s3_key).toBe("fixture/updated");
  expect(
    await sql`select * from product_categories where product_id=${product!.id} and category_id=${category!.id}`,
  ).toHaveLength(1);
  await page.goto(`/en/products/${handle}`);
  await expect(
    page.getByRole("heading", { name: "Updated fixture", exact: true }),
  ).toBeVisible();
  await page.goto(`/zh/products/${handle}`);
  await expect(
    page.getByRole("heading", { name: "更新商品", exact: true }),
  ).toBeVisible();

  // A second writer must not be silently overwritten by this open editor.
  await sql`update products set quote_version=quote_version+1,title='Concurrent change' where id=${product!.id}`;
  await admin.getByLabel("Title", { exact: true }).fill("Stale overwrite");
  await admin.getByRole("button", { name: "Save changes" }).click();
  await expect(admin.locator('[data-slot="alert"]')).toContainText(
    "changed since you opened it",
  );
  expect(
    (await sql`select title from products where id=${product!.id}`)[0]!.title,
  ).toBe("Concurrent change");

  // Hidden variant IDs cannot be used to edit a different product.
  await admin.reload();
  const [foreign] =
    await sql`select id from product_variants where product_id<>${product!.id} limit 1`;
  await admin.locator('input[name="variantId-0"]').evaluate((el, id) => {
    (el as HTMLInputElement).value = id;
  }, foreign!.id);
  await admin.getByRole("button", { name: "Save changes" }).click();
  await expect(admin.locator('[data-slot="alert"]')).toContainText(
    "variant list has changed",
  );
  expect(
    (await sql`select title from products where id=${product!.id}`)[0]!.title,
  ).toBe("Concurrent change");
});

test("management sidebar opens real sections and product editor fits mobile", async ({
  admin,
  sql,
}) => {
  for (const [label, path, heading] of [
    ["Overview", "/admin", "Daily queue"],
    ["Orders", "/admin/orders", "Orders"],
    ["Payments", "/admin/payments", "Payments"],
    ["Products", "/admin/products", "Products"],
    ["Fulfillment", "/admin/fulfillment", "Fulfillment"],
    ["Customers", "/admin/customers", "Customers"],
    ["Translations", "/admin/translations", "Translations"],
    ["Settings", "/admin/setup", "Store setup"],
  ]) {
    await admin.goto(path);
    await expect(admin).toHaveURL(new RegExp(`${path}$`));
    await expect(
      admin.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
    const link = admin
      .getByRole("navigation", { name: "Admin" })
      .getByRole("link", { name: label, exact: true });
    await expect(link).toHaveAttribute("href", path);
    await expect(link).toHaveAttribute("aria-current", "page");
  }
  const [product] =
    await sql`select id from products where handle='studio-cup'`;
  await admin.goto(`/admin/products/${product!.id}/edit`);
  for (const width of [375, 768, 1440]) {
    await admin.setViewportSize({ width, height: 900 });
    expect(
      await admin.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await admin.setViewportSize({ width: 375, height: 900 });
  const scan = await new AxeBuilder({ page: admin }).analyze();
  expect(
    scan.violations.filter((v) =>
      ["critical", "serious"].includes(v.impact ?? ""),
    ),
  ).toEqual([]);
  await admin.screenshot({
    path: "test-results/product-editor-mobile.png",
    fullPage: true,
  });
});
