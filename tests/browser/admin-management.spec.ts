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
    .getByRole("row")
    .filter({ hasText: "Editor fixture" })
    .getByRole("link", { name: "Edit" })
    .click();
  await expect(admin.getByLabel("Title", { exact: true })).toHaveValue(
    "Editor fixture",
  );
  await admin.getByLabel("Title", { exact: true }).fill("Updated fixture");
  await admin
    .getByLabel("Description", { exact: true })
    .fill("Updated description");
  const variantEditor = admin.getByRole("group", { name: "Original variant" });
  await variantEditor.getByLabel("Variant name").fill("Updated variant");
  await variantEditor.getByLabel("Price in minor units").fill("1750");
  await admin
    .getByRole("group", { name: "Image 1" })
    .getByLabel("Image asset key")
    .fill("fixture/updated");
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
  await admin.goto("/admin/translations?locale=zh");
  const translation = admin.locator("form.translation-editor").filter({
    hasText: "Updated fixture",
  });
  await translation.getByLabel("Chinese text").fill("更新商品");
  await translation.getByLabel("Chinese description").fill("更新描述");
  await translation.getByRole("button", { name: "Save translation" }).click();
  await page.goto(`/zh/products/${handle}`);
  await expect(
    page.getByRole("heading", { name: "更新商品", exact: true }),
  ).toBeVisible();

  // A second writer must not be silently overwritten by this open editor.
  await admin.goto(`/admin/products/${product!.id}/edit`);
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
    ["Overview", "/admin", "Commerce overview"],
    ["Orders", "/admin/orders", "Orders"],
    ["Payments", "/admin/payments", "Payments"],
    ["Products", "/admin/products", "Products"],
    ["Fulfillment", "/admin/fulfillment", "Fulfillment"],
    ["Promotions", "/admin/promotions", "Promotions"],
    ["Customers", "/admin/customers", "Customers"],
    ["Translations", "/admin/translations", "Translations"],
    ["Settings", "/admin/setup", "Store setup"],
    ["Activity", "/admin/activity", "Activity"],
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
  await admin.goto("/admin/categories");
  await expect(
    admin
      .getByRole("navigation", { name: "Catalog sections" })
      .getByRole("link", { name: "Categories" }),
  ).toHaveAttribute("aria-current", "page");
  await admin.goto("/admin/products/import");
  await expect(admin.getByRole("navigation", { name: "Admin" })).toBeVisible();
  await expect(
    admin
      .getByRole("navigation", { name: "Catalog sections" })
      .getByRole("link", { name: "Import & export" }),
  ).toHaveAttribute("aria-current", "page");
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

test("promotion codes apply to checkout and record one redemption", async ({
  admin,
  page,
  sql,
}) => {
  const code = `SAVE-${randomUUID().slice(0, 8)}`.toUpperCase();
  await admin.goto("/admin/promotions");
  const create = admin.locator("form").filter({
    has: admin.getByRole("button", { name: "Create promotion", exact: true }),
  });
  await create.getByLabel("Promotion name").fill("Checkout test");
  await create.getByLabel("Customer code").fill(code);
  await create.getByLabel("Discount value").fill("1000");
  await create.getByLabel("Minimum subtotal").fill("0");
  await create.getByRole("button", { name: "Create promotion" }).click();
  await expect(admin.getByText(new RegExp(`${code}.*Active`))).toBeVisible();

  await page.goto("/en/products/studio-cup");
  await page.getByRole("button", { name: "Add to bag" }).click();
  await page.getByRole("link", { name: "Continue to checkout" }).click();
  await page.getByLabel("Street address").fill("1 Promotion Street");
  await page.getByLabel("Promotion code").fill(code);
  await page
    .getByLabel("Payment method")
    .selectOption({ label: "Demo bank transfer" });
  await page.getByRole("button", { name: /Review your order/ }).click();
  await expect(page.getByText("Promotion", { exact: true })).toBeVisible();
  await page.getByLabel("Your name").fill("Promotion Customer");
  await page.getByLabel("Email address").fill("promotion@example.test");
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: /Accept total & place order/ })
    .click();
  await expect(page).toHaveURL(/\/en\/orders\/[0-9a-f-]+$/);
  const orderId = new URL(page.url()).pathname.split("/").pop()!;
  const [order] =
    await sql`select discount_cents from orders where id=${orderId}`;
  expect(order!.discount_cents).toBeGreaterThan(0);
  expect(
    await sql`select id from promotion_redemptions where order_id=${orderId}`,
  ).toHaveLength(1);
});

test("owner creates a manual order from the orders dialog", async ({
  admin,
  sql,
}) => {
  await admin.goto("/admin/orders");
  await admin.getByRole("button", { name: "Add manual order" }).click();
  const dialog = admin.getByRole("dialog", { name: "Add manual order" });
  await dialog.getByLabel("Customer name").fill("Manual Customer");
  await dialog.getByLabel("Customer email").fill("manual@example.test");
  await dialog.getByLabel("Shipping address").fill("1 Manual Street");
  await dialog
    .getByLabel("Payment method")
    .selectOption({ label: "Demo bank transfer" });
  await dialog.getByLabel("Product variant").selectOption({ index: 1 });
  await dialog.getByRole("button", { name: "Create order" }).click();
  await expect(admin).toHaveURL(/\/admin\/orders\?created=SP-/);
  await expect(admin.getByRole("status")).toContainText("Manual order SP-");
  expect(
    await sql`select id from orders where guest_email='manual@example.test'`,
  ).toHaveLength(1);
});
