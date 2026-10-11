import { randomUUID } from "node:crypto";
import { test, expect } from "./fixtures";
test("category search retains selections outside the first batch", async ({
  admin,
  sql,
}) => {
  const prefix = randomUUID();
  await sql`insert into categories(name,slug) select 'A fixture ' || ${prefix} || n, ${prefix} || n from generate_series(1,61) n`;
  const [selected] =
    await sql`insert into categories(name,slug) values ('ZZ selected ' || ${prefix}, ${prefix + "-selected"}) returning id,name`;
  const [product] =
    await sql`select id from products where handle='studio-cup'`;
  await sql`insert into product_categories(product_id,category_id) values (${product!.id},${selected!.id})`;
  await admin.goto(`/admin/products/${product!.id}/edit`);
  const group = admin.getByRole("group", { name: "Categories", exact: true });
  await expect(group.getByLabel(selected!.name, { exact: true })).toBeChecked();
  await group.getByLabel("Search categories").fill(prefix);
  await group
    .getByRole("button", { name: "Search categories", exact: true })
    .click();
  await expect(group.getByRole("status")).toContainText("Showing 50 matches");
  await expect(group.getByLabel(selected!.name, { exact: true })).toBeChecked();
  const values = await group.evaluate((element) =>
    new FormData(element.closest("form")!).getAll("categoryIds"),
  );
  expect(values).toContain(selected!.id);
});
