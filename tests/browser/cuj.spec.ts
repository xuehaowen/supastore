import {
  test,
  expect,
  checkout,
  openOrder,
  record,
  confirm,
  login,
  clickAction,
} from "./fixtures";
import { randomUUID } from "node:crypto";

test("C1/C2 search, empty results, category navigation and cart edit/remove across languages", async ({
  page,
}) => {
  await page.goto("/en");
  await page
    .getByRole("textbox", { name: /Search/ })
    .fill("no-such-product-" + randomUUID());
  await page.getByRole("button", { name: /Search/ }).click();
  await expect(page.getByText("No products found.")).toBeVisible();
  await page.goto("/en");
  const category = page
    .getByRole("navigation", { name: "Categories" })
    .getByRole("link")
    .nth(1);
  await category.click();
  await expect(page).toHaveURL(/category=/);
  await expect(
    page
      .getByRole("navigation", { name: "Categories" })
      .locator('[aria-current="page"]'),
  ).toHaveCount(1);
  await page.goto("/en/products/studio-cup");
  await page.getByRole("button", { name: "Add to bag" }).click();
  await expect(page).toHaveURL(/\/en\/cart$/);
  await page.goto("/en/cart");
  await clickAction(
    page,
    page.getByRole("button", {
      name: "Increase quantity of Studio cup",
      exact: true,
    }),
  );
  await page.reload();
  await expect(page.getByText("$48.00", { exact: true }).first()).toBeVisible();
  await page.getByRole("link", { name: "中文", exact: true }).click();
  await expect(page).toHaveURL(/\/zh\/cart/);
  await expect(page.getByText("$48.00", { exact: true }).first()).toBeVisible();
  await page.getByRole("link", { name: "English", exact: true }).click();
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Continue to checkout" }),
  ).toHaveCount(0);
});

test("C3/C4 checkout validates shipping and consent without losing the cart", async ({
  page,
  sql,
}) => {
  await page.goto("/en/products/studio-cup");
  await page.getByRole("button", { name: "Add to bag" }).click();
  await page.getByRole("link", { name: "Continue to checkout" }).click();
  await page
    .getByLabel("Street address")
    .evaluate((el) => el.removeAttribute("required"));
  await page.getByRole("button", { name: /Review your order/ }).click();
  await expect(page.locator('[data-slot="alert"]')).toContainText(
    "Enter your shipping address and country.",
  );
  await page.getByLabel("Street address").fill("1 Test St");
  await page
    .getByLabel("Payment method")
    .selectOption({ label: "Demo bank transfer" });
  await page.getByRole("button", { name: /Review your order/ }).click();
  await page.getByLabel("Your name").fill("Consent Customer");
  await page.getByLabel("Email address").fill("consent@example.test");
  await page.getByRole("checkbox").evaluate((el) => {
    el.removeAttribute("required");
    el.closest("form")!.noValidate = true;
  });
  await page
    .getByRole("button", { name: /Accept total & place order/ })
    .click();
  await expect(page.locator('[data-slot="alert"]')).toContainText(
    "Accept the final total",
  );
  expect(
    (await sql`select id from orders where guest_email='consent@example.test'`)
      .length,
  ).toBe(0);
  await page.goto("/en/cart");
  await expect(page.getByText("Studio cup", { exact: true })).toBeVisible();
});

test("C7/A3 free pickup confirms, rejects premature handoff, then completes", async ({
  page,
  admin,
  sql,
}) => {
  const order = await checkout(page, sql, { free: true, pickup: true });
  expect(order.purchase_total_cents).toBe(0);
  expect(order.lifecycle_status).toBe("confirmed");
  await expect(
    page.getByText("No payment or payment evidence is required."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Upload evidence", exact: true }),
  ).toHaveCount(0);
  let row = await openOrder(admin, order.reference_code);
  await row.getByLabel("Recipient / authorized recipient").fill("CUJ Customer");
  await clickAction(
    admin,
    row.getByRole("button", { name: "Complete pickup handoff", exact: true }),
  );
  await expect(admin.locator('[data-slot="alert"]')).toContainText(
    "Pickup must be marked ready before handoff.",
  );
  row = await openOrder(admin, order.reference_code);
  await clickAction(
    admin,
    row.getByRole("button", { name: "Mark ready for pickup", exact: true }),
  );
  await expect(admin).toHaveURL(
    /\/admin(?:\/orders|\/fulfillment|\/payments)?$/,
  );
  row = await openOrder(admin, order.reference_code);
  await row.getByLabel("Recipient / authorized recipient").fill("CUJ Customer");
  await clickAction(
    admin,
    row.getByRole("button", { name: "Complete pickup handoff", exact: true }),
  );
  await expect(admin).toHaveURL(
    /\/admin(?:\/orders|\/fulfillment|\/payments)?$/,
  );
  await page.reload();
  await expect(page.getByText(/completed · fulfilled/)).toBeVisible();
  expect(
    (await sql`select * from payment_receipts where order_id=${order.id}`)
      .length,
  ).toBe(0);
});

test("A1/A2/A3/A4 receipts, underpayment rejection, confirmation, packing slip and shipping correction", async ({
  page,
  admin,
  sql,
}) => {
  const order = await checkout(page, sql);
  await record(admin, order.reference_code, order.purchase_total_cents - 1);
  let row = await openOrder(admin, order.reference_code);
  await clickAction(
    admin,
    row.getByRole("button", { name: "Confirm exact payment", exact: true }),
  );
  await expect(admin.locator('[data-slot="alert"]')).toContainText(
    "Order is underfunded.",
  );
  expect(
    (await sql`select lifecycle_status from orders where id=${order.id}`)[0]!
      .lifecycle_status,
  ).toBe("unpaid");
  await record(admin, order.reference_code, 1);
  await confirm(admin, order.reference_code);
  await admin.goto(`/admin/orders/${order.id}/packing-slip`);
  await expect(
    admin.getByText(order.reference_code, { exact: false }).first(),
  ).toBeVisible();
  await expect(admin.getByText("1 Test Street", { exact: true })).toBeVisible();
  await admin.evaluate(() => {
    window.print = () => {
      (window as Window & { __printed?: boolean }).__printed = true;
    };
  });
  await admin.getByRole("button", { name: "Print Slip", exact: true }).click();
  expect(
    await admin.evaluate(
      () => (window as Window & { __printed?: boolean }).__printed === true,
    ),
  ).toBe(true);
  await admin.evaluate(() => {
    window.print = () => {
      document.body.dataset.printed = "true";
    };
  });
  await admin.getByRole("button", { name: "Print Slip", exact: true }).click();
  await expect(admin.locator("body")).toHaveAttribute("data-printed", "true");
  row = await openOrder(admin, order.reference_code);
  const correction = row.locator("form").filter({
    has: admin.getByRole("button", {
      name: "Correct fulfillment details",
      exact: true,
    }),
  });
  await correction
    .getByLabel("Corrected carrier / delivery method")
    .fill("Manual delivery");
  await correction.getByLabel("Corrected tracking number").fill("CORRECTED");
  await correction.getByLabel("Correction reason").fill("Tracking typo");
  await clickAction(admin, correction.getByRole("button"));
  await expect(admin).toHaveURL(
    /\/admin(?:\/orders|\/fulfillment|\/payments)?$/,
  );
  expect(
    (
      await sql`select tracking_number from order_fulfillments where order_id=${order.id}`
    )[0]!.tracking_number,
  ).toBe("CORRECTED");
  row = await openOrder(admin, order.reference_code);
  const shipment = row.locator("form").filter({
    has: admin.getByRole("button", {
      name: "Mark shipped / delivered",
      exact: true,
    }),
  });
  await shipment
    .getByLabel("Carrier", { exact: true })
    .fill("Synthetic courier");
  await shipment.getByLabel("Tracking number", { exact: true }).fill("SHIP-1");
  await clickAction(admin, shipment.getByRole("button"));
  await expect(admin).toHaveURL(
    /\/admin(?:\/orders|\/fulfillment|\/payments)?$/,
  );
  await page.reload();
  await expect(page.getByText(/completed · fulfilled/)).toBeVisible();
});

test("C8/C11/C12/A10 cancelled unpaid order retains private tracking and has no refund", async ({
  page,
  admin,
  sql,
  browser,
}) => {
  const order = await checkout(page, sql);
  const url = page.url();
  await sql`update orders set created_at=now()-interval '2 days' where id=${order.id}`;
  const row = await openOrder(admin, order.reference_code);
  await expect(
    admin.getByText(
      order.reference_code + " · Contact customer before resolving.",
    ),
  ).toBeVisible();
  await row
    .getByLabel("Cancellation reason")
    .fill("Unavailable purchase; customer contacted");
  await clickAction(
    admin,
    row.getByRole("button", { name: "Cancel order", exact: true }),
  );
  await expect(admin).toHaveURL(
    /\/admin(?:\/orders|\/fulfillment|\/payments)?$/,
  );
  await page.reload();
  await expect(page.getByText(/cancelled/).first()).toBeVisible();
  await expect(
    page.getByText("Payment instructions", { exact: true }),
  ).toHaveCount(0);
  expect(
    (await sql`select * from refund_authorizations where order_id=${order.id}`)
      .length,
  ).toBe(0);
  const stranger = await browser.newContext();
  try {
    const other = await stranger.newPage();
    await other.goto(url);
    await expect(other).toHaveURL(/\/recover$/);
    await expect(other.getByText("cuj@example.test")).toHaveCount(0);
  } finally {
    await stranger.close();
  }
});

test("A5/A6 owner authorizes, claims and reconciles a partial refund", async ({
  page,
  admin,
  sql,
}) => {
  const order = await checkout(page, sql);
  await record(admin, order.reference_code, order.purchase_total_cents);
  await confirm(admin, order.reference_code);
  const row = await openOrder(admin, order.reference_code);
  await row
    .getByLabel("Refund amount (minor units)", { exact: true })
    .fill("100");
  await row
    .getByLabel("Refund reason", { exact: true })
    .fill("Agreed partial refund");
  await clickAction(
    admin,
    row.getByRole("button", { name: "Authorize refund", exact: true }),
  );
  await expect(admin).toHaveURL(
    /\/admin(?:\/orders|\/fulfillment|\/payments)?$/,
  );
  const [allocation] =
    await sql`select pa.id from payout_allocations pa join refund_authorizations ra on ra.id=pa.refund_authorization_id where ra.order_id=${order.id}`;
  await admin.goto("/admin/payments");
  const payout = admin
    .locator("#payouts details")
    .filter({ hasText: allocation!.id });
  await payout.locator("summary").click();
  await payout.getByLabel("Claim amount (minor units)").fill("100");
  await payout
    .getByLabel("Verified return destination")
    .fill("SYNTHETIC-ACCOUNT");
  await clickAction(
    admin,
    payout.getByRole("button", { name: "Claim payout", exact: true }),
  );
  await expect(admin).toHaveURL(
    /\/admin(?:\/orders|\/fulfillment|\/payments)?$/,
  );
  await admin.reload();
  await payout.locator("summary").click();
  await expect(payout).toContainText("sending");
  await payout.getByLabel("Actual payout amount (minor units)").fill("100");
  await payout.getByLabel("Transfer reference").fill(randomUUID());
  await payout.getByLabel("Actual destination").fill("SYNTHETIC-ACCOUNT");
  await clickAction(
    admin,
    payout.getByRole("button", { name: "Reconcile payout", exact: true }),
  );
  await expect(admin).toHaveURL(
    /\/admin(?:\/orders|\/fulfillment|\/payments)?$/,
  );
  await admin.reload();
  await payout.locator("summary").click();
  await expect(payout).toContainText("reconciled");
  expect(
    (
      await sql`select settled_amount_cents from payout_allocations where id=${allocation!.id}`
    )[0]!.settled_amount_cents,
  ).toBe(100);
  expect(
    (await sql`select lifecycle_status from orders where id=${order.id}`)[0]!
      .lifecycle_status,
  ).toBe("confirmed");
});

test("A9 cash receipt records change and receipt correction is audited", async ({
  page,
  admin,
  sql,
}) => {
  const order = await checkout(page, sql);
  const [account] =
    await sql`insert into payment_accounts(account_name,account_identifier,account_type) values('CUJ Cash',${randomUUID()},'cash') returning id`;
  let row = await openOrder(admin, order.reference_code);
  const cash = row.locator("form").filter({
    has: admin.getByRole("button", {
      name: "Record cash receipt",
      exact: true,
    }),
  });
  await cash.getByLabel("Cash account").selectOption(account!.id);
  await cash
    .getByLabel("Cash amount (minor units)")
    .fill(String(order.purchase_total_cents));
  await cash
    .getByLabel("Tendered amount (minor units)")
    .fill(String(order.purchase_total_cents + 100));
  await cash.getByLabel("Payer name").fill("CUJ Customer");
  await clickAction(admin, cash.getByRole("button"));
  await expect(admin).toHaveURL(
    /\/admin(?:\/orders|\/fulfillment|\/payments)?$/,
  );
  await confirm(admin, order.reference_code);
  row = await openOrder(admin, order.reference_code);
  const correction = row.locator("form").filter({
    has: admin.getByRole("button", {
      name: "Open receipt correction",
      exact: true,
    }),
  });
  await correction.getByLabel("Correction delta (minor units)").fill("-1");
  await correction.getByLabel("Correction reason").fill("Reviewed amount typo");
  await correction
    .getByLabel("Investigation notes")
    .fill("Synthetic investigation");
  await clickAction(admin, correction.getByRole("button"));
  await expect(admin).toHaveURL(
    /\/admin(?:\/orders|\/fulfillment|\/payments)?$/,
  );
  expect(
    (
      await sql`select d.change_due_cents from cash_receipt_details d join payment_receipts r on r.id=d.receipt_id where r.order_id=${order.id}`
    )[0]!.change_due_cents,
  ).toBe(100);
  expect(
    (
      await sql`select c.delta_amount_cents from payment_receipt_corrections c join payment_receipts r on r.id=c.receipt_id where r.order_id=${order.id}`
    )[0]!.delta_amount_cents,
  ).toBe(-1);
});

test("M4/M5 staff role restrictions, revocation and last-owner protection", async ({
  page,
  admin,
  sql,
}) => {
  const id = randomUUID(),
    email = id + "@example.test";
  const { hashPassword } = await import("better-auth/crypto");
  const password = await hashPassword(process.env.DEMO_OWNER_PASSWORD!);
  await sql`insert into "user"(id,name,email,email_verified) values(${id},'CUJ Staff',${email},true)`;
  await sql`insert into account(id,account_id,provider_id,user_id,password) values(${randomUUID()},${id},'credential',${id},${password})`;
  await sql`insert into staff_memberships(user_id,email,role) values(${id},${email},'staff')`;
  await login(page, email);
  await expect(
    page.getByRole("button", { name: "Pause new orders", exact: true }),
  ).toHaveCount(0);
  for (const path of ["/api/admin/exports/orders"]) {
    expect((await page.request.get(path)).status()).toBe(403);
  }
  await admin.goto("/admin/setup");
  const member = admin.locator("div.border-t").filter({ hasText: email });
  await member.locator('select[name="active"]').selectOption("false");
  await clickAction(
    admin,
    member.getByRole("button", { name: "Save access", exact: true }),
  );
  await expect(admin).toHaveURL(/\/admin\/setup$/);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login/);
  await admin.goto("/admin/setup");
  const owner = admin
    .locator("div.border-t")
    .filter({ hasText: "owner@example.test" });
  await clickAction(
    admin,
    owner.getByRole("button", { name: "Remove membership", exact: true }),
  );
  await expect(admin.locator('[data-slot="alert"]')).toContainText(
    /last.*owner/i,
  );
});

test("M3 CSV preview rejects invalid rows, imports valid data and exports both resources", async ({
  page,
  admin,
  sql,
}) => {
  await checkout(page, sql);
  await admin.goto("/admin/products/import");
  const input = admin.locator('input[type="file"]');
  await input.setInputFiles({
    name: "bad.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "handle,sku,title,variant_title,price_cents\nitem,,Item,Default,-1",
    ),
  });
  await expect(admin.locator("#confirm-import-btn")).toHaveCount(0);
  await expect(admin.getByText(/error/i).first()).toBeVisible();
  await admin
    .getByRole("button", { name: "Choose a different file", exact: true })
    .click();
  const handle = "csv-" + randomUUID();
  await input.setInputFiles({
    name: "valid.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      `handle,sku,title,variant_title,price_cents\n${handle},${handle},CSV Product,Default,100`,
    ),
  });
  await admin.locator("#confirm-import-btn").click();
  await expect(admin.getByText(/Import complete/i)).toBeVisible();
  expect(
    (await sql`select id from products where handle=${handle}`).length,
  ).toBe(1);
  for (const selector of ["#export-products-btn", "#export-orders-btn"]) {
    const download = admin.waitForEvent("download");
    await admin.locator(selector).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.csv$/);
    const stream = await file.createReadStream();
    let csv = "";
    for await (const chunk of stream!) csv += chunk.toString();
    expect(csv).toContain(
      selector.includes("products") ? handle : "cuj@example.test",
    );
  }
});

test("C6 failed upload can retry; clipboard copies stable payment reference", async ({
  page,
  sql,
  context,
}) => {
  const order = await checkout(page, sql);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page
    .getByRole("button", { name: "Copy payment reference", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Copied", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    order.reference_code,
  );
  const file = {
    name: "proof.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
      "base64",
    ),
  };
  await page.route(
    "**/api/evidence",
    (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Storage temporarily unavailable" }),
      }),
    { times: 1 },
  );
  await page.getByLabel("Payment image", { exact: false }).setInputFiles(file);
  await page
    .getByRole("button", { name: "Upload evidence", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText(
    "Storage temporarily unavailable",
  );
  await expect(
    page.getByRole("button", { name: "Upload evidence", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Upload evidence", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText(
    "Evidence received. This is not a payment receipt.",
  );
  await page.reload();
  await expect(page.getByText(/1 image\(s\) received/)).toBeVisible();
});

test("M1/M2 setup profile, shipping, pickup, payment toggles and categories persist", async ({
  admin,
  sql,
}) => {
  await admin.goto("/admin/setup");
  await admin.getByLabel("Store name", { exact: true }).fill("CUJ Store");
  await clickAction(
    admin,
    admin.getByRole("button", { name: "Save profile", exact: true }),
  );
  expect(
    (await sql`select store_name from store_settings`)[0]!.store_name,
  ).toBe("CUJ Store");
  await admin.reload();
  await admin
    .getByLabel("Zone name", { exact: true })
    .first()
    .fill("CUJ Shipping");
  await clickAction(
    admin,
    admin
      .getByRole("button", { name: "Save shipping zone", exact: true })
      .first(),
  );
  expect((await sql`select name from shipping_zones`)[0]!.name).toBe(
    "CUJ Shipping",
  );
  await admin.reload();
  await admin.getByLabel("Location name", { exact: true }).fill("CUJ Pickup");
  await admin
    .getByLabel("Pickup address", { exact: true })
    .fill("2 Test Street");
  await clickAction(
    admin,
    admin.getByRole("button", { name: "Save pickup", exact: true }),
  );
  expect(
    (await sql`select id from pickup_location where name='CUJ Pickup'`).length,
  ).toBe(1);
  await admin.reload();
  await admin
    .getByLabel("Method name", { exact: true })
    .last()
    .fill("CUJ Bank");
  await admin
    .getByLabel("Receiving account and instructions")
    .last()
    .fill("SYNTHETIC-" + randomUUID());
  await clickAction(
    admin,
    admin.getByRole("button", { name: "Add payment method", exact: true }),
  );
  await admin.reload();
  const method = admin
    .locator("div")
    .filter({
      has: admin.getByRole("heading", { name: "CUJ Bank", exact: true }),
    })
    .filter({
      has: admin.getByRole("button", { name: "Disable", exact: true }),
    })
    .last();
  await clickAction(
    admin,
    method.getByRole("button", { name: "Disable", exact: true }),
  );
  expect(
    (
      await sql`select is_active from payment_accounts where account_name='CUJ Bank'`
    )[0]!.is_active,
  ).toBe(false);
  await admin.goto("/admin/setup/verify-email?token=invalid");
  await clickAction(
    admin,
    admin.getByRole("button", { name: "Confirm email delivery", exact: true }),
  );
  await expect(admin.locator('[data-slot="alert"]')).toBeVisible();
  await admin.goto("/admin/categories");
  await admin
    .getByRole("button", { name: "Add category", exact: true })
    .click();
  const categoryDialog = admin.getByRole("dialog", { name: "Add category" });
  await categoryDialog
    .getByLabel("Category name", { exact: true })
    .fill("CUJ category");
  await categoryDialog
    .getByLabel("Category handle", { exact: true })
    .fill("cuj-category");
  await clickAction(
    admin,
    categoryDialog.getByRole("button", { name: "Add category", exact: true }),
  );
  expect(
    (await sql`select id from categories where slug='cuj-category'`).length,
  ).toBe(1);
  await admin.goto("/admin/products");
  await admin.getByRole("button", { name: "Add product", exact: true }).click();
  await admin.getByRole("button", { name: "Add variant", exact: true }).click();
  const handle = "cuj-multi-" + randomUUID();
  await admin.getByLabel("Title", { exact: true }).fill("CUJ multi variant");
  await admin.getByLabel("URL handle", { exact: true }).fill(handle);
  await admin
    .getByLabel("SKU")
    .nth(0)
    .fill(handle + "-a");
  await admin
    .getByLabel("SKU")
    .nth(1)
    .fill(handle + "-b");
  await admin.getByLabel("Price in minor units").nth(0).fill("1200");
  await admin.getByLabel("Price in minor units").nth(1).fill("1400");
  await clickAction(
    admin,
    admin.getByRole("button", { name: "Publish product", exact: true }),
  );
  expect(
    (await sql`select sku from product_variants where sku like ${handle + "%"}`)
      .length,
  ).toBe(2);
});

test("A8 wrong-destination payout requires discrepancy resolution; unused claim can close", async ({
  page,
  admin,
  sql,
}) => {
  const order = await checkout(page, sql);
  await record(admin, order.reference_code, order.purchase_total_cents);
  await confirm(admin, order.reference_code);
  for (const reason of ["Wrong destination review", "Unused claim"]) {
    const row = await openOrder(admin, order.reference_code);
    await row
      .getByLabel("Refund amount (minor units)", { exact: true })
      .fill("100");
    await row.getByLabel("Refund reason", { exact: true }).fill(reason);
    await clickAction(
      admin,
      row.getByRole("button", { name: "Authorize refund", exact: true }),
    );
    const [allocation] =
      await sql`select pa.id from payout_allocations pa join refund_authorizations ra on ra.id=pa.refund_authorization_id where ra.order_id=${order.id} and ra.reason=${reason}`;
    await admin.goto("/admin");
    const payout = admin
      .locator("#payouts details")
      .filter({ hasText: allocation!.id });
    await payout.locator("summary").click();
    await payout.getByLabel("Claim amount (minor units)").fill("100");
    await payout.getByLabel("Verified return destination").fill("EXPECTED");
    await clickAction(
      admin,
      payout.getByRole("button", { name: "Claim payout", exact: true }),
    );
    await admin.reload();
    await payout.locator("summary").click();
    if (reason === "Unused claim") {
      await payout
        .getByLabel("Closure reason")
        .fill("Verified no transfer occurred");
      await clickAction(
        admin,
        payout.getByRole("button", {
          name: "Close payout attempt",
          exact: true,
        }),
      );
    } else {
      await payout.getByLabel("Actual payout amount (minor units)").fill("100");
      await payout.getByLabel("Transfer reference").fill(randomUUID());
      await payout.getByLabel("Actual destination").fill("WRONG");
      await clickAction(
        admin,
        payout.getByRole("button", { name: "Reconcile payout", exact: true }),
      );
      await admin.reload();
      await payout.locator("summary").click();
      await expect(payout).toContainText("reconciliation_required");
      await payout.getByLabel("Write-off amount (minor units)").fill("100");
      await payout
        .getByLabel("Resolution reason")
        .fill("Reviewed synthetic loss");
      await clickAction(
        admin,
        payout.getByRole("button", {
          name: "Resolve discrepancy",
          exact: true,
        }),
      );
      expect(
        (
          await sql`select status from payout_discrepancies where payout_attempt_id in (select id from payout_attempts where allocation_id=${allocation!.id})`
        )[0]!.status,
      ).toBe("resolved");
    }
    expect(
      (
        await sql`select status from payout_attempts where allocation_id=${allocation!.id}`
      )[0]!.status,
    ).toBe("reconciled");
  }
});

test("M4 packing slips and private exports require an authenticated staff session", async ({
  page,
  sql,
}) => {
  const order = await checkout(page, sql);
  await page.goto(`/admin/orders/${order.id}/packing-slip`);
  await expect(page).toHaveURL(/\/admin\/login$/);
  expect((await page.request.get("/api/admin/exports/orders")).status()).toBe(
    401,
  );
});

async function reviewCheckout(page: import("@playwright/test").Page) {
  await page.goto("/en/products/studio-cup");
  await page.getByRole("button", { name: "Add to bag" }).click();
  await page.getByRole("link", { name: "Continue to checkout" }).click();
  await page.getByLabel("Street address").fill("1 Test Street");
  await page
    .getByLabel("Payment method")
    .selectOption({ label: "Demo bank transfer" });
  await page.getByRole("button", { name: /Review your order/ }).click();
  await page.getByLabel("Your name").fill("Retry Customer");
  await page.getByLabel("Email address").fill("retry@example.test");
  await page.getByRole("checkbox").check();
  return new URL(page.url()).searchParams.get("quote")!;
}

test("C3/M6 stale quote and paused submission preserve the cart", async ({
  page,
  admin,
  sql,
}) => {
  let quote = await reviewCheckout(page);
  await sql`update quotes set expires_at=now()-interval '1 minute' where id=${quote}`;
  await clickAction(
    page,
    page.getByRole("button", { name: /Accept total & place order/ }),
  );
  await expect(page.locator('[data-slot="alert"]')).toContainText(
    "changed or expired",
  );
  expect(
    (await sql`select id from orders where quote_id=${quote}`).length,
  ).toBe(0);
  await page.goto("/en/cart");
  await expect(page.getByText("Studio cup", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Continue to checkout" }).click();
  await page.getByLabel("Street address").fill("1 Test Street");
  await page
    .getByLabel("Payment method")
    .selectOption({ label: "Demo bank transfer" });
  await page.getByRole("button", { name: /Review your order/ }).click();
  await page.getByLabel("Your name").fill("Paused Customer");
  await page.getByLabel("Email address").fill("paused@example.test");
  await page.getByRole("checkbox").check();
  quote = new URL(page.url()).searchParams.get("quote")!;
  await admin.goto("/admin");
  await clickAction(
    admin,
    admin.getByRole("button", { name: "Pause new orders", exact: true }),
  );
  try {
    await clickAction(
      page,
      page.getByRole("button", { name: /Accept total & place order/ }),
    );
    await expect(
      page
        .locator('[data-slot="alert"]')
        .filter({ hasText: "We couldn’t complete" }),
    ).toContainText("paused");
    expect(
      (await sql`select id from orders where quote_id=${quote}`).length,
    ).toBe(0);
  } finally {
    await admin.goto("/admin");
    await clickAction(
      admin,
      admin.getByRole("button", { name: "Resume new orders", exact: true }),
    );
  }
});

test("C5 committed order survives a lost response and browser retry without duplication", async ({
  page,
  sql,
}) => {
  const quote = await reviewCheckout(page);
  const reviewUrl = page.url();
  let dropped!: () => void;
  const committed = new Promise<void>((resolve) => {
    dropped = resolve;
  });
  await page.route(
    "**/en/checkout?quote=*",
    async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      await route.fetch({ maxRedirects: 0 });
      await route.abort("failed");
      dropped();
    },
    { times: 1 },
  );
  await page
    .getByRole("button", { name: /Accept total & place order/ })
    .click();
  await committed;
  const saved =
    await sql`select id,reference_code from orders where quote_id=${quote}`;
  expect(saved).toHaveLength(1);
  await page.goto(reviewUrl);
  await page.getByLabel("Your name").fill("Retry Customer");
  await page.getByLabel("Email address").fill("retry@example.test");
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: /Accept total & place order/ })
    .click();
  await expect(page).toHaveURL(new RegExp(saved[0]!.id + "$"));
  await expect(
    page.getByRole("heading", { name: saved[0]!.reference_code }),
  ).toBeVisible();
  expect(
    (await sql`select id from orders where quote_id=${quote}`).length,
  ).toBe(1);
});

test("A5 paid cancellation stops fulfillment and creates return work", async ({
  page,
  admin,
  sql,
}) => {
  const order = await checkout(page, sql);
  await record(admin, order.reference_code, order.purchase_total_cents);
  await confirm(admin, order.reference_code);
  const row = await openOrder(admin, order.reference_code);
  await row.getByLabel("Cancellation reason").fill("Customer cancellation");
  await clickAction(
    admin,
    row.getByRole("button", { name: "Cancel order", exact: true }),
  );
  await page.reload();
  await expect(page.getByText(/cancelled/).first()).toBeVisible();
  expect(
    (
      await sql`select sum(amount_cents)::int as amount from refund_authorizations where order_id=${order.id}`
    )[0]!.amount,
  ).toBe(order.purchase_total_cents);
  await admin.goto("/admin/payments");
  await expect(admin.locator("#payouts")).toContainText(
    String(order.purchase_total_cents),
  );
});

test("A7 overpayment can be returned before confirmation", async ({
  page,
  admin,
  sql,
}) => {
  const order = await checkout(page, sql);
  await record(admin, order.reference_code, order.purchase_total_cents + 100);
  let row = await openOrder(admin, order.reference_code);
  await clickAction(
    admin,
    row.getByRole("button", { name: "Confirm exact payment", exact: true }),
  );
  await expect(admin.locator('[data-slot="alert"]')).toContainText(
    /surplus|overfunded|excess/i,
  );
  await admin.goto("/admin/fulfillment");
  row = admin.locator("#ready details").filter({
    has: admin.locator("summary", { hasText: order.reference_code }),
  });
  await expect(row).toHaveCount(1);
  await row.locator("summary").click();
  await row.getByLabel("Surplus return amount (minor units)").fill("100");
  await row.getByLabel("Return reason").fill("Return excess payment");
  await clickAction(
    admin,
    row.getByRole("button", { name: "Authorize surplus return", exact: true }),
  );
  const [allocation] =
    await sql`select pa.id from payout_allocations pa join payment_receipts pr on pr.id=pa.receipt_id where pr.order_id=${order.id}`;
  await admin.goto("/admin");
  const payout = admin
    .locator("#payouts details")
    .filter({ hasText: allocation!.id });
  await payout.locator("summary").click();
  await payout.getByLabel("Claim amount (minor units)").fill("50");
  await payout.getByLabel("Verified return destination").fill("RETURN");
  await clickAction(
    admin,
    payout.getByRole("button", { name: "Claim payout", exact: true }),
  );
  await admin.reload();
  await payout.locator("summary").click();
  await payout.getByLabel("Actual payout amount (minor units)").fill("100");
  await payout.getByLabel("Transfer reference").fill(randomUUID());
  await payout.getByLabel("Actual destination").fill("RETURN");
  await clickAction(
    admin,
    payout.getByRole("button", { name: "Reconcile payout", exact: true }),
  );
  row = await openOrder(admin, order.reference_code);
  await clickAction(
    admin,
    row.getByRole("button", { name: "Confirm exact payment", exact: true }),
  );
  await expect(admin.locator('[data-slot="alert"]')).toContainText(
    "payout hold",
  );
  await admin.goto("/admin");
  await payout.locator("summary").click();
  await payout.getByLabel("Write-off amount (minor units)").fill("0");
  await payout
    .getByLabel("Resolution reason")
    .fill(
      "Reviewed claim limit breach; customer received the authorized return",
    );
  await clickAction(
    admin,
    payout.getByRole("button", { name: "Resolve discrepancy", exact: true }),
  );
  await confirm(admin, order.reference_code);
  expect(
    (await sql`select lifecycle_status from orders where id=${order.id}`)[0]!
      .lifecycle_status,
  ).toBe("confirmed");
});
