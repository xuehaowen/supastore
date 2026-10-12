import { randomUUID } from "node:crypto";
import { test, expect } from "./fixtures";

test("manual order search finds a variant beyond the initial batch and preserves selection", async ({
  admin,
  sql,
}) => {
  const productId = randomUUID();
  const prefix = `ZZZ-${productId}`;
  const rows = Array.from({ length: 51 }, (_, index) => ({
    id: randomUUID(),
    sku: `${prefix}-${String(index).padStart(3, "0")}`,
  }));
  await sql`insert into products(id,handle,title) values (${productId},${prefix},'Search fixture')`;
  try {
    await sql`insert into product_variants(id,product_id,sku,title,price_cents)
      select r.id,${productId}::uuid,r.sku,'Fixture',100
      from jsonb_to_recordset(${sql.json(rows)}::jsonb) as r(id uuid, sku text)`;
    await admin.goto("/admin/orders");
    await admin.getByRole("button", { name: "Add manual order" }).click();
    const dialog = admin.getByRole("dialog", { name: "Add manual order" });
    const select = dialog.getByLabel("Product variant", { exact: true });
    const last = rows[50]!;
    await expect(select.locator(`option[value="${last.id}"]`)).toHaveCount(0);
    await dialog.getByLabel("Search variants", { exact: true }).fill(last.sku);
    await dialog.getByRole("button", { name: "Search", exact: true }).click();
    await expect(select.locator(`option[value="${last.id}"]`)).toHaveCount(1);
    await select.selectOption(last.id);
    await dialog
      .getByLabel("Search variants", { exact: true })
      .fill(rows[0]!.sku);
    await dialog.getByRole("button", { name: "Search", exact: true }).click();
    await expect(select.locator(`option[value="${rows[0]!.id}"]`)).toHaveCount(
      1,
    );
    await expect(select).toHaveValue(last.id);
  } finally {
    await sql`delete from product_variants where product_id=${productId}`;
    await sql`delete from products where id=${productId}`;
  }
});
