import { randomUUID } from "node:crypto";
import { test, expect, checkout, login, clickAction } from "./fixtures";

test("daily work opens a consistent order workspace and separates dispatch from delivery", async ({
  page,
  admin,
  sql,
}) => {
  const order = await checkout(page, sql);
  await admin.goto("/admin");
  const sections = admin.locator("main.admin > section");
  await expect(sections.first()).toHaveAccessibleName("Needs attention");
  await expect(admin.getByText("Daily work", { exact: true })).toBeVisible();
  await admin.goto(`/admin/orders?q=${order.reference_code}`);
  const row = admin.getByRole("row").filter({ hasText: order.reference_code });
  await expect(
    row.getByRole("link", { name: order.reference_code, exact: true }),
  ).toHaveAttribute("href", `/admin/orders/${order.id}`);
  await row.getByRole("link", { name: "View order", exact: true }).click();
  await expect(admin).toHaveURL(new RegExp(`/admin/orders/${order.id}$`));
  await admin
    .getByRole("button", { name: "Record payment", exact: true })
    .click();
  const payment = admin.getByRole("dialog", { name: "Record actual payment" });
  await payment
    .getByLabel("Actual received amount (USD)")
    .fill((order.purchase_total_cents / 100).toFixed(2));
  await expect(payment.locator('input[name="amount"]')).toHaveValue(
    String(order.purchase_total_cents),
  );
  await payment.getByLabel("Actual payment reference").fill(randomUUID());
  await payment.getByRole("checkbox").check();
  await clickAction(
    admin,
    payment.getByRole("button", { name: "Record receipt", exact: true }),
  );
  await clickAction(
    admin,
    admin.getByRole("button", { name: "Confirm exact payment", exact: true }),
  );
  await expect(
    admin.getByRole("button", { name: "Dispatch shipment", exact: true }),
  ).toBeVisible();
  await expect(
    admin.getByRole("button", { name: "Record delivery", exact: true }),
  ).toHaveCount(0);
  await admin
    .getByRole("button", { name: "Dispatch shipment", exact: true })
    .click();
  const dispatch = admin.getByRole("dialog", {
    name: "Dispatch shipment",
    exact: true,
  });
  await dispatch
    .getByLabel("Carrier or delivery method")
    .fill("Daily work courier");
  await dispatch.getByLabel("Tracking number").fill("DAILY-1");
  await clickAction(
    admin,
    dispatch.getByRole("button", { name: "Dispatch shipment", exact: true }),
  );
  await expect(
    admin.getByRole("button", { name: "Record delivery", exact: true }),
  ).toBeVisible();
  expect(
    (await sql`select lifecycle_status from orders where id=${order.id}`)[0]!
      .lifecycle_status,
  ).toBe("confirmed");
  await admin
    .getByRole("button", { name: "Record delivery", exact: true })
    .click();
  const delivery = admin.getByRole("dialog", {
    name: "Record completed delivery",
  });
  await delivery
    .getByLabel("Carrier or delivery method")
    .fill("Daily work courier");
  await delivery.getByLabel("Tracking number").fill("DAILY-1");
  await clickAction(
    admin,
    delivery.getByRole("button", { name: "Record delivery", exact: true }),
  );
  await expect(admin.getByText("completed", { exact: true })).toBeVisible();
  expect(
    (await sql`select lifecycle_status from orders where id=${order.id}`)[0]!
      .lifecycle_status,
  ).toBe("completed");
});

test("staff navigation, stock counts and mobile menu support daily work without tracking privileges", async ({
  page,
  sql,
}) => {
  const id = randomUUID(),
    email = `daily-${id}@example.test`;
  const { hashPassword } = await import("better-auth/crypto");
  const password = await hashPassword(process.env.DEMO_OWNER_PASSWORD!);
  await sql`insert into "user"(id,name,email,email_verified) values(${id},'Daily Staff',${email},true)`;
  await sql`insert into account(id,account_id,provider_id,user_id,password) values(${randomUUID()},${id},'credential',${id},${password})`;
  await sql`insert into staff_memberships(user_id,email,role) values(${id},${email},'staff')`;
  const [product] =
    await sql`insert into products(handle,title) values(${`daily-${id}`},'Daily stock count') returning id`;
  const [variant] =
    await sql`insert into product_variants(product_id,sku,title,price_cents) values(${product!.id},${`daily-${id}`},'Default',1250) returning id`;
  await sql`insert into variant_stock(variant_id,on_hand,tracking_enabled) values(${variant!.id},0,true)`;
  await login(page, email);
  const nav = page.getByRole("navigation", { name: "Admin", exact: true });
  for (const name of ["Settings", "Translations", "Activity", "Notifications"])
    await expect(nav.getByRole("link", { name, exact: true })).toHaveCount(0);
  await nav.getByRole("link", { name: "Inventory", exact: true }).click();
  await page.getByLabel("Search inventory").fill(`daily-${id}`);
  await page.getByRole("button", { name: "Filter", exact: true }).click();
  await page.getByRole("button", { name: "Record count", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: `Stock count · daily-${id}` });
  await expect(
    dialog.getByRole("checkbox", { name: "Track stock" }),
  ).toHaveCount(0);
  await dialog.getByLabel("Physical quantity").fill("8");
  await dialog.getByLabel("Count reason").fill("Daily shelf count");
  await clickAction(
    page,
    dialog.getByRole("button", { name: "Save stock count" }),
  );
  await expect(page.getByText("Stock count recorded.")).toBeVisible();
  expect(
    (
      await sql`select on_hand,tracking_enabled from variant_stock where variant_id=${variant!.id}`
    )[0],
  ).toMatchObject({ on_hand: 8, tracking_enabled: true });
  // Verify a forged tracking change is rejected by the backend, not just hidden in the UI.
  await page.getByLabel("Search inventory").fill(`daily-${id}`);
  await page.getByRole("button", { name: "Filter", exact: true }).click();
  await page.getByRole("button", { name: "Record count", exact: true }).click();
  dialog = page.getByRole("dialog", { name: `Stock count · daily-${id}` });
  await dialog
    .locator('input[name="tracking"]')
    .evaluate((input: HTMLInputElement) => {
      input.value = "";
    });
  await dialog.getByLabel("Physical quantity").fill("9");
  await dialog.getByLabel("Count reason").fill("Forged tracking change");
  await clickAction(
    page,
    dialog.getByRole("button", { name: "Save stock count" }),
  );
  await expect(page.locator('[data-slot="alert"]')).toContainText(
    "Only owners can change stock tracking",
  );
  expect(
    (
      await sql`select on_hand,tracking_enabled from variant_stock where variant_id=${variant!.id}`
    )[0],
  ).toMatchObject({ on_hand: 8, tracking_enabled: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open admin menu" }).click();
  await expect(
    nav.getByRole("link", { name: "Orders", exact: true }),
  ).toBeVisible();
  await nav.getByRole("link", { name: "Orders", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Open admin menu" }),
  ).toBeVisible();
});
