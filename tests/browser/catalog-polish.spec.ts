import { randomUUID } from "node:crypto";
import { test, expect, clickAction } from "./fixtures";

test("public catalog requests responsive optimized thumbnails", async ({
  page, admin, sql,
}) => {
  const [product] = await sql`select id from products where handle='studio-cup'`;
  await admin.goto(`/admin/products/${product!.id}/edit`);
  await admin.getByLabel("Image file").setInputFiles({
    name: "thumbnail.png", mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAGUlEQVQokWN4+uI+SYhhVMOL0VB6OlyTBgCmaawfkFnzKAAAAABJRU5ErkJggg==", "base64"),
  });
  await admin.getByLabel("Image description", { exact: true }).fill("Thumbnail fixture");
  await admin.getByRole("button", { name: "Upload image", exact: true }).click();
  await expect(admin.getByRole("status").filter({ hasText: "Image uploaded." })).toBeVisible({ timeout: 20000 });
  await page.goto("/en");
  const image = page.getByRole("img", { name: "Studio cup", exact: true });
  await expect(image).toBeVisible();
  await expect
    .poll(() =>
      image.evaluate((element: HTMLImageElement) => element.naturalWidth),
    )
    .toBeGreaterThan(0);
  const src = await image.evaluate(
    (element: HTMLImageElement) => element.currentSrc,
  );
  expect(new URL(src).pathname).toBe("/_next/image");
  const response = await page.request.get(src);
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toMatch(/^image\//);
});

test("merchant reviews bulk changes and retains edits and categories after invalid product edits", async ({
  admin,
  sql,
}) => {
  admin.on("dialog", (dialog) => dialog.accept());
  const code = randomUUID();
  const [product] =
    await sql`insert into products(handle,title,is_published) values(${`bulk-${code}`},'Bulk review product',false) returning id`;
  const variants =
    await sql`insert into product_variants(product_id,sku,title,price_cents) values
    (${product!.id},${`SMALL-${code}`},'Small',1000),(${product!.id},${`LARGE-${code}`},'Large',1500) returning id,sku,price_cents`;
  await admin.goto(`/admin/products/${product!.id}/edit`);
  const bulk = admin.locator("section").filter({
    has: admin.getByRole("heading", {
      name: "Bulk variant changes",
      exact: true,
    }),
  });
  await bulk.getByRole("checkbox", { name: "Select all variants" }).check();
  await bulk
    .getByLabel("New price in minor units", { exact: false })
    .fill("1250");
  await bulk.getByLabel("New availability").selectOption("false");
  await bulk.getByRole("button", { name: "Review bulk changes" }).click();
  await expect(bulk).toContainText("1000 → 1250");
  await expect(bulk).toContainText("1500 → 1250");
  expect(
    (
      await sql`select price_cents from product_variants where id=${variants[0]!.id}`
    )[0]!.price_cents,
  ).toBe(1000);
  await clickAction(
    admin,
    bulk.getByRole("button", { name: "Apply bulk changes" }),
  );
  const saved =
    await sql`select id,sku,price_cents,is_available from product_variants where product_id=${product!.id}`;
  expect(saved.map((v) => v.id).sort()).toEqual(
    variants.map((v) => v.id).sort(),
  );
  expect(saved.every((v) => v.price_cents === 1250 && !v.is_available)).toBe(
    true,
  );
  const [category] = await sql`insert into categories(slug,name) values(${`draft-${code}`},${`Draft category ${code}`}) returning id`;
  await admin.reload();
  await admin.getByRole("checkbox", { name: `Draft category ${code}`, exact: true }).check();
  await admin.getByLabel("Title", { exact: true }).fill("Keep my edited title");
  await admin.getByLabel("URL handle").fill("Invalid HANDLE");
  await expect(
    admin.getByRole("status").filter({ hasText: "unsaved changes" }),
  ).toBeVisible();
  await clickAction(
    admin,
    admin.getByRole("button", { name: "Save changes", exact: true }),
  );
  await expect(admin.getByLabel("Title", { exact: true })).toHaveValue(
    "Keep my edited title",
  );
  await expect(admin.getByLabel("URL handle")).toHaveValue("Invalid HANDLE");
  await expect(
    admin.getByRole("status").filter({ hasText: "restored after the error" }),
  ).toBeVisible();
  await expect(admin.getByRole("checkbox", { name: `Draft category ${code}`, exact: true })).toBeChecked();
  expect(
    (await sql`select title from products where id=${product!.id}`)[0]!.title,
  ).toBe("Bulk review product");
  await admin.getByLabel("URL handle").fill(`bulk-${code}`);
  await clickAction(admin, admin.getByRole("button", { name: "Save changes", exact: true }));
  const memberships = await sql`select category_id from product_categories where product_id=${product!.id}`;
  expect(memberships.map((row) => row.category_id)).toEqual([category!.id]);
});

test("category tables page literal searches and preserve hierarchy", async ({
  admin,
  sql,
}) => {
  const code = randomUUID().slice(0, 8);
  for (let i = 0; i < 28; i++)
    await sql`insert into categories(slug,name,sort_order) values(${`pager-${code}-${i}`},${`Pager 100% ${code} ${String(i).padStart(2, "0")}`},${i})`;
  await admin.goto(`/admin/categories?q=${encodeURIComponent(`100% ${code}`)}`);
  await expect(admin.getByRole("row")).toHaveCount(26);
  await expect(admin.getByText("1–25 of 28")).toBeVisible();
  await admin.getByRole("link", { name: "Next →", exact: true }).click();
  await expect(admin.getByRole("row")).toHaveCount(4);
  await expect(admin.getByText("26–28 of 28")).toBeVisible();
  const [parent] =
    await sql`insert into categories(slug,name) values(${`parent-${code}`},${`Parent ${code}`}) returning id`;
  await sql`insert into categories(slug,name,parent_id) values(${`child-${code}`},'Child',${parent!.id})`;
  await admin.goto(
    `/admin/categories?q=${encodeURIComponent(`Parent ${code}`)}`,
  );
  await expect(
    admin.getByRole("row").filter({ hasText: "Child" }),
  ).toContainText(`Parent ${code} / Child`);
});
