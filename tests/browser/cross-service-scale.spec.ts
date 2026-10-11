import { randomUUID } from "node:crypto";
import { parseCatalogDto } from "@supastore/contracts";
import { test, expect } from "./fixtures";

test.skip(
  process.env.STOREFRONT_TESTS !== "true",
  "Requires the separate storefront fixture.",
);

test("serves bounded catalog pages and concurrent reports for 10,000-row fixtures", async ({
  page,
  admin,
  sql,
}) => {
  test.setTimeout(120000);
  const prefix = `service-scale-${randomUUID()}`;
  const period = "start=2072-01-01&end=2072-02-01";
  try {
    await sql`insert into products(handle,title) select ${prefix} || '-' || n, ${prefix} || ' product ' || n from generate_series(1,10000) n`;
    await sql`insert into product_variants(product_id,sku,title,price_cents) select id,handle,'Scale variant',100 from products where handle like ${prefix + "%"}`;
    await sql`insert into outside_sales_adjustments(sale_date,net_cents,tax_cents,reason,actor_id,request_key,payload_hash)
      select '2072-01-01'::date,100,10,${prefix},(select user_id from staff_memberships where role='owner' and is_active limit 1),gen_random_uuid(),'fixture' from generate_series(1,10000)`;
    await sql`analyze products`;
    await sql`analyze product_variants`;
    const outcomes = await Promise.allSettled([
      page.request.get(
        `/api/v1/catalog?search=${encodeURIComponent(prefix)}&pageSize=100&page=1`,
      ),
      page.request.get(
        `/api/v1/catalog?search=${encodeURIComponent(prefix)}&pageSize=100&page=100`,
      ),
      admin.request.get(`/admin/reports?${period}&page=1`),
      admin.request.get(`/admin/reports?${period}&page=100`),
      admin.request.get(`/admin/reports/export?${period}`),
    ]);
    const responses = outcomes.map((outcome) => {
      if (outcome.status === "rejected") throw outcome.reason;
      expect(outcome.value.status()).toBe(200);
      return outcome.value;
    });
    const first = parseCatalogDto((await responses[0]!.json()).data);
    const last = parseCatalogDto((await responses[1]!.json()).data);
    expect(first.total).toBe(10000);
    expect(last.total).toBe(10000);
    expect(first.items).toHaveLength(100);
    expect(last.items).toHaveLength(100);
    expect(
      last.items.some((item) =>
        first.items.some((other) => other.id === item.id),
      ),
    ).toBe(false);
    expect(await responses[2]!.text()).toContain(prefix);
    expect(await responses[3]!.text()).toContain(prefix);
    expect(responses[4]!.headers()["cache-control"]).toBe("no-store");
    const lines = (await responses[4]!.text()).trimEnd().split("\r\n");
    expect(lines).toHaveLength(10001);
    expect(new Set(lines.slice(1).map((line) => line.split(",")[0])).size).toBe(
      10000,
    );
    await admin.goto(`/admin/reports?${period}&page=100`);
    await expect(admin.locator("tbody tr")).toHaveCount(100);
    const navigation = admin.getByRole("navigation", {
      name: "page pagination",
      exact: true,
    });
    await expect(navigation).toContainText("Page 100");
    await expect(
      navigation.getByRole("link", { name: "Next", exact: true }),
    ).toHaveCount(0);
  } finally {
    await sql`delete from product_variants where product_id in (select id from products where handle like ${prefix + "%"})`;
    await sql`delete from products where handle like ${prefix + "%"}`;
    // Append-only report entries remain only in this runner's disposable database.
  }
});
