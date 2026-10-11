import { test, expect, checkout } from "./fixtures";

test("order actions preserve filtered pages and management selection on failure and success", async ({
  page,
  admin,
  sql,
}) => {
  const order = await checkout(page, sql);
  const query = new URLSearchParams({
    q: order.reference_code,
    page: "2",
    status: "unpaid",
    manage: order.id,
  });
  await admin.goto(`/admin/orders?${query}`);
  const dialog = admin.getByRole("dialog", { name: "Manage order payment" });
  await dialog
    .getByRole("button", { name: "Confirm exact payment", exact: true })
    .click();
  await expect
    .poll(() => new URL(admin.url()).searchParams.get("error"))
    .toBeTruthy();
  for (const [key, value] of query)
    expect(new URL(admin.url()).searchParams.get(key)).toBe(value);
  await dialog
    .getByLabel("Cancellation reason")
    .fill("Workflow fixture cancellation");
  await dialog
    .getByRole("button", { name: "Cancel order", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (
          await sql`select lifecycle_status from orders where id=${order.id}`
        )[0]!.lifecycle_status,
    )
    .toBe("cancelled");
  await expect
    .poll(() => new URL(admin.url()).searchParams.get("error"))
    .toBeNull();
  for (const [key, value] of query)
    expect(new URL(admin.url()).searchParams.get(key)).toBe(value);
});
