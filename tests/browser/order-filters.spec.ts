import { randomUUID } from "node:crypto";
import { checkout, test, expect } from "./fixtures";

test("owner sorts and filters orders and exports the matching fulfillment details", async ({
  page,
  admin,
  sql,
}) => {
  const first = await checkout(page, sql);
  const second = await checkout(page, sql);
  const marker = `Filters-${randomUUID()}`;
  const [location] =
    await sql`insert into pickup_location(name,address,weekly_schedule) values(${marker},'Market, Main Street','{}') returning id`;
  await sql`update orders set guest_name=${marker + " A"},purchase_total_cents=2000,fulfillment_type='pickup',terms_snapshot=terms_snapshot || ${JSON.stringify({ pickup: { locationId: location!.id, address: "Market, Main Street", date: "2026-10-25", startTime: "10:00", endTime: "11:00" } })}::jsonb where id=${first.id}`;
  await sql`update orders set guest_name=${marker + " B"},purchase_total_cents=1000 where id=${second.id}`;
  await admin.goto("/admin/orders");
  await admin
    .getByLabel("Customer name or email", { exact: true })
    .fill(marker);
  await admin.getByLabel("Sort by", { exact: true }).selectOption("total");
  await admin.getByLabel("Sort direction").selectOption("asc");
  await admin.getByRole("button", { name: "Filter", exact: true }).click();
  const rows = admin.getByRole("table").getByRole("row");
  await expect(rows.nth(1)).toContainText(second.reference_code);
  await expect(rows.nth(2)).toContainText(first.reference_code);
  await expect(rows.nth(1)).toContainText("$10.00");
  const selection = admin.getByRole("checkbox", {
    name: `Select order ${first.reference_code}`,
    exact: true,
  });
  await selection.check();
  const showItems = admin.getByRole("button", {
    name: `Show items for order ${first.reference_code}`,
    exact: true,
  });
  await expect(showItems).toHaveAttribute("aria-expanded", "false");
  await showItems.click();
  const items = admin.getByRole("region", {
    name: `Items for order ${first.reference_code}`,
    exact: true,
  });
  await expect(items).toBeVisible();
  await expect(
    items.getByRole("columnheader", { name: "Quantity", exact: true }),
  ).toBeVisible();
  await expect(
    items.getByRole("columnheader", { name: "Unit price", exact: true }),
  ).toBeVisible();
  await expect(selection).toBeChecked();
  await admin
    .getByRole("button", {
      name: `Hide items for order ${first.reference_code}`,
      exact: true,
    })
    .press("Enter");
  await expect(items).toHaveCount(0);
  await expect(showItems).toHaveAttribute("aria-expanded", "false");
  await admin.getByLabel("Pickup location", { exact: true }).fill(marker);
  await admin.getByLabel("Pickup from", { exact: true }).fill("2026-10-25");
  await admin
    .getByLabel("Pickup start time from", { exact: true })
    .fill("09:00");
  await admin.getByLabel("Minimum total", { exact: true }).fill("15.50");
  await admin.getByRole("button", { name: "Filter", exact: true }).click();
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(1)).toContainText("2026-10-25 10:00");
  await admin.getByLabel("Orders to export").selectOption("filtered");
  const downloading = admin.waitForEvent("download");
  await admin
    .getByRole("button", { name: "Export orders CSV", exact: true })
    .click();
  const download = await downloading;
  let csv = "";
  for await (const chunk of (await download.createReadStream())!)
    csv += chunk.toString();
  expect(csv).toContain(first.reference_code);
  expect(csv).not.toContain(second.reference_code);
  expect(csv).toContain('"Market, Main Street"');
  expect(csv).toContain("2026-10-25,10:00,11:00");
  expect(csv).toContain("purchase_total");
  expect(csv).not.toContain("purchase_total_cents");
  const link = await rows
    .nth(1)
    .getByRole("link", { name: "View order" })
    .getAttribute("href");
  const back = new URL(link!, "http://localhost").searchParams.get("back")!;
  expect(back).toContain("minTotal=15.50");
  expect(back).toContain("sort=total");
  await rows.nth(1).getByRole("link", { name: "View order" }).click();
  await admin.goto(back);
  await expect(admin.getByLabel("Minimum total", { exact: true })).toHaveValue(
    "15.50",
  );
  await expect(rows).toHaveCount(2);
  await admin.getByRole("link", { name: "Clear filters" }).click();
  await expect(
    admin.getByLabel("Customer name or email", { exact: true }),
  ).toHaveValue("");
});
