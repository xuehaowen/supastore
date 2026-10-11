import { randomUUID } from "node:crypto";
import { test, expect } from "./fixtures";

test("report evidence is paged while its CSV includes every financial entry", async ({
  admin,
  sql,
}) => {
  const marker = `browser-report-${randomUUID()}`;
  await sql`insert into outside_sales_adjustments(sale_date,net_cents,tax_cents,reason,actor_id,request_key,payload_hash)
    select (now() at time zone s.timezone)::date,100,10,${marker},
      (select user_id from staff_memberships where role='owner' and is_active limit 1),gen_random_uuid(),'fixture'
    from store_settings s cross join generate_series(1,205) limit 205`;
  await admin.goto("/admin/reports");
  await expect(admin.locator("tbody tr")).toHaveCount(100);
  const next = admin
    .getByRole("navigation", { name: "page pagination", exact: true })
    .getByRole("link", { name: "Next", exact: true });
  await next.click();
  await expect(admin).toHaveURL(/page=2/);
  await expect(admin.locator("tbody tr")).toHaveCount(100);
  const exportPath = await admin
    .getByRole("link", { name: "Export CSV", exact: true })
    .getAttribute("href");
  const response = await admin.request.get(exportPath!);
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toBe("no-store");
  const csv = await response.text();
  expect(csv.match(new RegExp(marker, "g"))).toHaveLength(205);
});
