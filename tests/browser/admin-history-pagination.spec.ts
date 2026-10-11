import { randomUUID } from "node:crypto";
import { test, expect } from "./fixtures";

test("promotion and translation pages expose records beyond the first batch", async ({
  admin,
  sql,
}) => {
  const fixture = randomUUID();
  const entries = Array.from({ length: 51 }, (_, index) => ({
    id: randomUUID(),
    name: `000-pagination-${String(index).padStart(3, "0")}`,
    code: `${fixture}-${index}`,
  }));
  try {
    await sql`insert into promotions (id, code, name, discount_type, discount_value, created_at)
      select r.id, r.code, r.name, 'fixed', 100, '2099-01-01'::timestamptz
      from jsonb_to_recordset(${sql.json(entries)}) as r(id uuid, code text, name text)`;
    await sql`insert into products (id, handle, title)
      select r.id, r.code, r.name from jsonb_to_recordset(${sql.json(entries)}) as r(id uuid, code text, name text)`;
    await admin.goto("/admin/promotions");
    await expect(admin.locator("details")).toHaveCount(50);
    await admin
      .getByRole("navigation", { name: "page pagination", exact: true })
      .getByRole("link", { name: "Next" })
      .click();
    await expect(admin).toHaveURL(/page=2/);
    const lastPromotion = [...entries].sort((a, b) =>
      a.id.localeCompare(b.id),
    )[0]!;
    await expect(
      admin.locator("summary").filter({ hasText: lastPromotion.code }),
    ).toBeVisible();
    await admin.goto("/admin/translations?locale=zh");
    const products = admin.locator("section").filter({
      has: admin.getByRole("heading", { name: "Products", exact: true }),
    });
    await expect(products.locator(".translation-row")).toHaveCount(50);
    await expect(
      products.getByText(entries[50]!.name, { exact: true }),
    ).toHaveCount(0);
    await products.getByRole("link", { name: "Next" }).click();
    await expect(admin).toHaveURL(/productsPage=2/);
    await expect(
      products.getByText(entries[50]!.name, { exact: true }),
    ).toBeVisible();
    expect(new URL(admin.url()).searchParams.get("locale")).toBe("zh");
  } finally {
    await sql`delete from promotions where id in ${sql(entries.map((entry) => entry.id))}`;
    await sql`delete from products where id in ${sql(entries.map((entry) => entry.id))}`;
  }
});
