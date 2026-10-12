import { randomUUID } from "node:crypto";
import { generateOrderReferenceCode } from "../../src/domain/money/reference-code";
import { checkout, test, expect } from "./fixtures";

test("fulfillment pages retain older work and direct order links", async ({
  admin,
  page,
  sql,
}) => {
  const purchase = await checkout(page, sql);
  const [source] = await sql`select * from orders where id=${purchase.id}`;
  const records = Array.from({ length: 110 }, (_, index) => ({
    id: randomUUID(),
    cart_id: randomUUID(),
    reference_code: generateOrderReferenceCode(),
    created_at: new Date(Date.now() - (110 - index) * 60000).toISOString(),
  }));
  await sql`insert into carts(id,guest_session_id)
    select r.cart_id,'pagination:' || r.cart_id::text from jsonb_to_recordset(${sql.json(records)}) as r(cart_id uuid)`;
  try {
    await sql`insert into orders(id,source_cart_id,quote_id,reference_code,lifecycle_status,purchase_total_cents,guest_email,guest_name,shipping_address_snapshot,terms_snapshot,created_at)
      select r.id,r.cart_id,${source!.quote_id},r.reference_code,'confirmed',${source!.purchase_total_cents},'pagination@example.test','Pagination fixture',${sql.json(source!.shipping_address_snapshot)},${sql.json(source!.terms_snapshot)},r.created_at
      from jsonb_to_recordset(${sql.json(records)}) as r(id uuid,cart_id uuid,reference_code text,created_at timestamptz)`;
    const oldest = records[0]!;
    await admin.goto("/admin/fulfillment");
    await expect(admin.locator("#ready details")).toHaveCount(50);
    await expect(
      admin.getByText(oldest.reference_code, { exact: false }),
    ).toHaveCount(0);
    const pagination = admin.getByRole("navigation", {
      name: "fulfillment pagination",
    });
    await pagination.getByRole("link", { name: "Next", exact: true }).click();
    await expect(admin).toHaveURL(/fulfillmentPage=2/);
    await expect(admin.locator("#ready details")).toHaveCount(50);
    await pagination.getByRole("link", { name: "Next", exact: true }).click();
    await expect(admin.locator("#ready details")).toHaveCount(10);
    await expect(
      admin.getByText(oldest.reference_code, { exact: false }),
    ).toBeVisible();
    await admin.goto(`/admin/fulfillment?manage=${oldest.id}`);
    await expect(
      admin.locator(`#order-fulfillment-${oldest.id}[open]`),
    ).toBeVisible();
    await pagination.getByRole("link", { name: "Next", exact: true }).click();
    expect(new URL(admin.url()).searchParams.has("manage")).toBe(false);
    await expect(admin.locator("#ready details")).toHaveCount(50);
  } finally {
    await sql`delete from orders where id in ${sql(records.map((record) => record.id))}`;
    await sql`delete from carts where id in ${sql(records.map((record) => record.cart_id))}`;
  }
});
