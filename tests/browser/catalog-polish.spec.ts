import { randomUUID } from "node:crypto";
import { test, expect, clickAction } from "./fixtures";

test("product image batches retain successful uploads and retry only failed files", async ({
  admin,
  sql,
}) => {
  const code = randomUUID();
  const [product] =
    await sql`insert into products(handle,title,is_published) values(${`batch-${code}`},'Batch image product',false) returning id`;
  const [variant] =
    await sql`insert into product_variants(product_id,sku,title,price_cents) values(${product!.id},${`BATCH-${code}`},'Blue',1000) returning id`;
  await admin.goto(`/admin/products/${product!.id}/edit`);
  let fail = true;
  let requests = 0;
  await admin.route("**/api/catalog-images", async (route) => {
    requests++;
    if (
      fail &&
      route
        .request()
        .postDataBuffer()
        ?.includes(Buffer.from('filename="back.png"'))
    ) {
      fail = false;
      await route.fulfill({
        status: 400,
        json: { error: "Synthetic upload failure." },
      });
    } else await route.continue();
  });
  const buffer = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAGUlEQVQokWN4+uI+SYhhVMOL0VB6OlyTBgCmaawfkFnzKAAAAABJRU5ErkJggg==",
    "base64",
  );
  await admin.getByLabel("Image file").setInputFiles(
    ["front.png", "back.png", "side.png"].map((name) => ({
      name,
      mimeType: "image/png",
      buffer,
    })),
  );
  for (const name of ["front", "back", "side"])
    await admin
      .getByLabel(`Image description for ${name}.png`, { exact: true })
      .fill(`${name} view`);
  await admin.getByLabel("Apply image to").selectOption(variant!.id);
  await admin
    .getByRole("button", { name: "Upload images", exact: true })
    .click();
  await expect(
    admin.getByRole("alert").filter({ hasText: "2 of 3 images uploaded." }),
  ).toBeVisible({ timeout: 20000 });
  await expect(
    admin.getByText("back.png: Synthetic upload failure.", { exact: true }),
  ).toBeVisible();
  expect(requests).toBe(3);
  expect(
    (
      await sql`select alt_text from product_images where product_id=${product!.id} order by sort_order`
    ).map((row) => row.alt_text),
  ).toEqual(["front view", "side view"]);
  await admin
    .getByRole("button", { name: "Retry failed images", exact: true })
    .click();
  await expect(
    admin.getByRole("alert").filter({ hasText: "3 images uploaded." }),
  ).toBeVisible({ timeout: 20000 });
  expect(requests).toBe(4);
  const saved =
    await sql`select alt_text,variant_id from product_images where product_id=${product!.id} order by sort_order`;
  expect(saved.map((row) => row.alt_text)).toEqual([
    "front view",
    "side view",
    "back view",
  ]);
  expect(saved.every((row) => row.variant_id === variant!.id)).toBe(true);
  await admin.reload();
  await expect(admin.getByText(/3 images uploaded\./)).toBeVisible();
});

test("public catalog requests responsive optimized thumbnails", async ({
  page,
  admin,
  sql,
}) => {
  const [product] =
    await sql`select id from products where handle='studio-cup'`;
  await admin.goto(`/admin/products/${product!.id}/edit`);
  await admin.getByLabel("Image file").setInputFiles({
    name: "thumbnail.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAGUlEQVQokWN4+uI+SYhhVMOL0VB6OlyTBgCmaawfkFnzKAAAAABJRU5ErkJggg==",
      "base64",
    ),
  });
  await admin
    .locator("form")
    .filter({
      has: admin.getByRole("button", { name: "Upload image", exact: true }),
    })
    .getByLabel("Image description", { exact: true })
    .fill("Thumbnail fixture");
  await admin
    .getByRole("button", { name: "Upload image", exact: true })
    .click();
  await expect(
    admin.getByRole("alert").filter({ hasText: "Image uploaded." }),
  ).toBeVisible({ timeout: 20000 });
  // The home catalog is cached for 30 seconds; search reads the new image now.
  await page.goto("/en/search?q=studio");
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
  await sql`insert into categories(slug,name) select ${`before-${code}-`} || i, ${`A draft ${code} `} || i from generate_series(1,51) i`;
  const [category] =
    await sql`insert into categories(slug,name) values(${`draft-${code}`},${`Draft category ${code}`}) returning id`;
  await admin.reload();
  await admin
    .getByLabel("Search categories", { exact: true })
    .fill(`Draft category ${code}`);
  await admin
    .getByRole("button", { name: "Search categories", exact: true })
    .click();
  await admin
    .getByRole("checkbox", { name: `Draft category ${code}`, exact: true })
    .check();
  await admin.getByLabel("Title", { exact: true }).fill("Keep my edited title");
  await admin.getByLabel("URL handle").fill("Invalid HANDLE");
  await expect(
    admin.getByRole("alert").filter({ hasText: "unsaved changes" }),
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
    admin.getByRole("alert").filter({ hasText: "restored after the error" }),
  ).toBeVisible();
  await expect(
    admin.getByRole("checkbox", {
      name: `Draft category ${code}`,
      exact: true,
    }),
  ).toBeChecked();
  expect(
    (await sql`select title from products where id=${product!.id}`)[0]!.title,
  ).toBe("Bulk review product");
  await admin.getByLabel("URL handle").fill(`bulk-${code}`);
  await clickAction(
    admin,
    admin.getByRole("button", { name: "Save changes", exact: true }),
  );
  const memberships =
    await sql`select category_id from product_categories where product_id=${product!.id}`;
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
