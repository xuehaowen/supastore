import { randomUUID } from "node:crypto";
import {
  checkout,
  test,
  expect,
  clickAction,
  record,
  confirm,
} from "./fixtures";
import { generateOrderReferenceCode } from "../../apps/backend/src/domain/money/reference-code";

test("cash account choices exclude banks and forged non-cash receipts are rejected", async ({
  page,
  admin,
  sql,
}) => {
  const order = await checkout(page, sql);
  const [cash] =
    await sql`insert into payment_accounts(account_name,account_identifier,account_type) values('Workflow cash',${randomUUID()},'cash') returning id`;
  const [inactive] =
    await sql`insert into payment_accounts(account_name,account_identifier,account_type,is_active) values('Inactive workflow cash',${randomUUID()},'cash',false) returning id`;
  const [bank] =
    await sql`select id from payment_accounts where account_type <> 'cash' and is_active limit 1`;
  await admin.goto(`/admin/orders/${order.id}`);
  await admin
    .getByRole("button", { name: "Record cash payment", exact: true })
    .click();
  let dialog = admin.getByRole("dialog", {
    name: "Record cash payment",
    exact: true,
  });
  const options = dialog.getByLabel("Cash account").locator("option");
  expect(
    await options.evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLOptionElement).value),
    ),
  ).not.toContain(bank!.id);
  expect(
    await options.evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLOptionElement).value),
    ),
  ).not.toContain(inactive!.id);
  await dialog.getByLabel("Cash account").selectOption(cash!.id);
  await dialog.getByLabel("Cash amount (USD)").fill("1.00");
  await dialog.getByLabel("Tendered amount (USD)").fill("2.00");
  await dialog.getByLabel("Payer name").fill("Workflow payer");
  await dialog
    .getByLabel("Cash account")
    .evaluate((select: HTMLSelectElement, id: string) => {
      select.selectedOptions[0]!.value = id;
    }, bank!.id);
  await clickAction(
    admin,
    dialog.getByRole("button", { name: "Record cash receipt", exact: true }),
  );
  await expect(admin.locator('[data-slot="alert"]')).toContainText(
    "Choose an active cash account",
  );
  expect(
    await sql`select id from payment_receipts where order_id=${order.id}`,
  ).toHaveLength(0);
  await admin
    .getByRole("button", { name: "Record cash payment", exact: true })
    .click();
  dialog = admin.getByRole("dialog", {
    name: "Record cash payment",
    exact: true,
  });
  await dialog.getByLabel("Cash account").selectOption(cash!.id);
  await dialog.getByLabel("Cash amount (USD)").fill("1.00");
  await dialog.getByLabel("Tendered amount (USD)").fill("2.00");
  await dialog.getByLabel("Payer name").fill("Workflow payer");
  await clickAction(
    admin,
    dialog.getByRole("button", { name: "Record cash receipt", exact: true }),
  );
  expect(
    (
      await sql`select payment_account_id,amount_cents from payment_receipts where order_id=${order.id}`
    )[0],
  ).toMatchObject({ payment_account_id: cash!.id, amount_cents: 100 });
});

test("fulfillment separates task queues from history and preserves the return filter", async ({
  page,
  admin,
  sql,
}) => {
  const sourceOrder = await checkout(page, sql);
  const [source] = await sql`select * from orders where id=${sourceOrder.id}`;
  const marker = `Queue-${randomUUID()}`;
  const records: { id: string; cart: string; reference: string }[] = [];
  try {
    for (const [status, lifecycle, type] of [
      ["unfulfilled", "confirmed", "shipping"],
      ["ready_for_pickup", "confirmed", "pickup"],
      ["shipped", "confirmed", "shipping"],
      ["fulfilled", "completed", "shipping"],
    ]) {
      const id = randomUUID(),
        cart = randomUUID(),
        reference = generateOrderReferenceCode();
      await sql`insert into carts(id,guest_session_id) values(${cart},${cart})`;
      await sql`insert into orders(id,source_cart_id,quote_id,reference_code,lifecycle_status,fulfillment_type,purchase_total_cents,guest_email,guest_name,shipping_address_snapshot,terms_snapshot)
        values(${id},${cart},${source!.quote_id},${reference},${lifecycle!},${type!},${source!.purchase_total_cents},'queue@example.test',${marker},${sql.json(source!.shipping_address_snapshot)},${sql.json(source!.terms_snapshot)})`;
      records.push({ id, cart, reference });
      await sql`insert into order_fulfillments(order_id,status) values(${id},${status!})`;
    }
    await admin.goto(`/admin/fulfillment?q=${marker}`);
    await expect(admin.locator("#ready details")).toHaveCount(3);
    await expect(
      admin.getByText(records[3]!.reference, { exact: false }),
    ).toHaveCount(0);
    for (const [work, index, stage] of [
      ["prepare", 0, "To prepare · Next: Prepare shipment"],
      ["ready", 1, "Ready for pickup · Next: Complete pickup handoff"],
      ["transit", 2, "In transit · Next: Record delivery"],
      ["completed", 3, "Completed · Next: View order & fulfillment"],
    ] as const) {
      await admin.getByLabel("Work queue").selectOption(work);
      await admin
        .getByRole("button", { name: "Filter fulfillment", exact: true })
        .click();
      await expect(admin.locator("#ready details")).toHaveCount(1);
      await expect(admin.locator("#ready summary")).toContainText(
        records[index]!.reference,
      );
      await expect(admin.locator("#ready summary")).toContainText(stage);
      if (work === "ready")
        await admin.screenshot({
          path: "test-results/admin-fulfillment-queue.png",
        });
    }
    await admin.locator("#ready summary").click();
    await admin
      .getByRole("link", { name: "View order & fulfillment", exact: true })
      .click();
    await admin
      .getByRole("link", { name: "← Back to fulfillment", exact: true })
      .click();
    await expect(admin).toHaveURL(
      new RegExp(`/admin/fulfillment\\?q=${marker}&work=completed$`),
    );
    expect(new URL(admin.url()).searchParams.get("work")).toBe("completed");
    expect(new URL(admin.url()).searchParams.get("q")).toBe(marker);
    await admin.getByLabel("Work queue").selectOption("all");
    await admin
      .getByRole("button", { name: "Filter fulfillment", exact: true })
      .click();
    await expect(admin.locator("#ready details")).toHaveCount(4);
  } finally {
    for (const record of records) {
      await sql`delete from order_fulfillments where order_id=${record.id}`;
      await sql`delete from orders where id=${record.id}`;
      await sql`delete from carts where id=${record.cart}`;
    }
  }
});

test("partial shipment guides remaining dispatch and keeps the originating list", async ({
  page,
  admin,
  sql,
}) => {
  const order = await checkout(page, sql, { quantity: 2 });
  await record(admin, order.reference_code, order.purchase_total_cents);
  await confirm(admin, order.reference_code);
  const back =
    "/admin/orders?" +
    new URLSearchParams({
      q: order.reference_code,
      status: "confirmed",
      page: "2",
    });
  const detail =
    "/admin/orders/" + order.id + "?back=" + encodeURIComponent(back);
  await admin.goto(detail);
  await admin
    .getByRole("link", {
      name: "Manage partial shipments & reschedule booking",
      exact: true,
    })
    .click();
  let form = admin.locator("form").filter({
    has: admin.getByRole("button", {
      name: "Dispatch shipment",
      exact: true,
    }),
  });
  await form.getByLabel("Carrier / delivery method").fill("Partial courier");
  await form.locator('input[type="number"]').fill("1");
  await clickAction(
    admin,
    form.getByRole("button", { name: "Dispatch shipment", exact: true }),
  );
  await expect(
    admin.getByText("Fulfillment saved.", { exact: true }),
  ).toBeVisible();
  expect(new URL(admin.url()).searchParams.get("back")).toBe(detail);
  await admin
    .getByRole("link", { name: "Order " + order.reference_code, exact: true })
    .click();
  await expect(admin).toHaveURL(new URL(detail, admin.url()).href);
  await expect(
    admin.getByRole("button", { name: "Record delivery", exact: true }),
  ).toHaveCount(0);
  await expect(
    admin.getByRole("link", { name: "Dispatch remaining units", exact: true }),
  ).toBeVisible();
  await admin.goto(
    "/admin/fulfillment?" +
      new URLSearchParams({ q: order.reference_code, work: "prepare" }),
  );
  await expect(admin.locator("#ready summary")).toContainText(
    "Partially dispatched · Next: Dispatch remaining units",
  );
  await admin.screenshot({ path: "test-results/admin-partial-dispatch.png" });
  await admin.goto(detail);
  await admin
    .getByRole("link", { name: "Dispatch remaining units", exact: true })
    .click();
  form = admin.locator("form").filter({
    has: admin.getByRole("button", {
      name: "Dispatch shipment",
      exact: true,
    }),
  });
  await form.getByLabel("Carrier / delivery method").fill("Final courier");
  await clickAction(
    admin,
    form.getByRole("button", { name: "Dispatch shipment", exact: true }),
  );
  await expect(
    admin.getByText("All units dispatched.", { exact: true }),
  ).toBeVisible();
  await expect(
    admin.getByRole("button", { name: "Dispatch shipment", exact: true }),
  ).toHaveCount(0);
  await admin.screenshot({
    path: "test-results/admin-all-units-dispatched.png",
  });
  expect(new URL(admin.url()).searchParams.get("back")).toBe(detail);
  await admin
    .getByRole("link", { name: "Order " + order.reference_code, exact: true })
    .click();
  await admin.getByRole("link", { name: "← All orders", exact: true }).click();
  await expect(admin).toHaveURL(new URL(back, admin.url()).href);
});
