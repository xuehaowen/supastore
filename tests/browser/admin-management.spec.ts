import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { checkout, record, test, expect } from "./fixtures";

test("product editor saves existing variants and translations without replacing records", async ({
  admin,
  page,
  sql,
}) => {
  const handle = `edit-${randomUUID()}`;
  const [product] =
    await sql`insert into products(handle,title) values(${handle},'Editor fixture') returning *`;
  const [variant] =
    await sql`insert into product_variants(product_id,sku,title,price_cents,attributes) values(${product!.id},${handle},'Original variant',1200,'{"material":"cotton"}') returning *`;
  const [image] =
    await sql`insert into product_images(product_id,s3_key,alt_text) values(${product!.id},'fixture/old','Original image') returning *`;
  await admin.goto("/admin/products");
  await admin
    .getByRole("row")
    .filter({ hasText: "Editor fixture" })
    .getByRole("link", { name: "Edit" })
    .click();
  await expect(admin.getByLabel("Title", { exact: true })).toHaveValue(
    "Editor fixture",
  );
  await admin.getByLabel("Title", { exact: true }).fill("Updated fixture");
  await admin
    .getByLabel("Description", { exact: true })
    .fill("Updated description");
  const variantEditor = admin.getByRole("row", {
    name: "Original variant",
    exact: true,
  });
  await variantEditor.getByLabel("Variant name").fill("Updated variant");
  await variantEditor.getByLabel("Price in minor units").fill("1750");
  await admin
    .getByRole("group", { name: "Image 1" })
    .getByLabel("Image description")
    .fill("Updated image description");
  const [category] = await sql`select id,name from categories limit 1`;
  const categoryGroup = admin.getByRole("group", {
    name: "Categories",
    exact: true,
  });
  await categoryGroup.getByLabel("Search categories").fill(category!.name);
  await categoryGroup
    .getByRole("button", { name: "Search categories", exact: true })
    .click();
  await admin
    .getByRole("group", { name: "Categories", exact: true })
    .getByLabel(category!.name, { exact: true })
    .check();
  await admin.getByRole("button", { name: "Save changes" }).click();
  await expect(
    admin.getByRole("alert").filter({ hasText: "Product changes saved" }),
  ).toBeVisible();
  const [saved] = await sql`select * from products where id=${product!.id}`;
  expect(saved!.quote_version).toBe(product!.quote_version + 1);
  expect(saved!.title).toBe("Updated fixture");
  const [savedVariant] =
    await sql`select * from product_variants where product_id=${product!.id}`;
  expect(savedVariant!.id).toBe(variant!.id);
  expect(savedVariant!.price_cents).toBe(1750);
  expect(savedVariant!.attributes).toEqual({ material: "cotton" });
  const [savedImage] =
    await sql`select * from product_images where product_id=${product!.id}`;
  expect(savedImage!.id).toBe(image!.id);
  expect(savedImage!.s3_key).toBe("fixture/old");
  expect(savedImage!.alt_text).toBe("Updated image description");
  expect(
    await sql`select * from product_categories where product_id=${product!.id} and category_id=${category!.id}`,
  ).toHaveLength(1);
  await page.goto(`/en/products/${handle}`);
  await expect(
    page.getByRole("heading", { name: "Updated fixture", exact: true }),
  ).toBeVisible();
  await admin.goto("/admin/translations?locale=zh");
  const translationRow = admin.locator(".translation-row").filter({
    hasText: "Updated fixture",
  });
  await translationRow.getByRole("button", { name: "Add translation" }).click();
  const translation = admin.getByRole("dialog", {
    name: /Chinese translation · Updated fixture/,
  });
  await translation.getByLabel("Chinese text").fill("更新商品");
  await translation.getByLabel("Chinese description").fill("更新描述");
  await translation.getByRole("button", { name: "Save translation" }).click();
  await expect(translation).not.toBeVisible();
  await expect
    .poll(
      async () =>
        (
          await sql`select title from product_translations where product_id=${product!.id} and locale='zh'`
        )[0]?.title,
    )
    .toBe("更新商品");
  await page.goto(`/zh/products/${handle}`);
  await expect(
    page.getByRole("heading", { name: "更新商品", exact: true }),
  ).toBeVisible();

  // A second writer must not be silently overwritten by this open editor.
  await admin.goto(`/admin/products/${product!.id}/edit`);
  await sql`update products set quote_version=quote_version+1,title='Concurrent change' where id=${product!.id}`;
  await admin.getByLabel("Title", { exact: true }).fill("Stale overwrite");
  await admin.getByRole("button", { name: "Save changes" }).click();
  await expect(admin.locator('[data-slot="alert"]')).toContainText(
    "changed since you opened it",
  );
  expect(
    (await sql`select title from products where id=${product!.id}`)[0]!.title,
  ).toBe("Concurrent change");

  // Hidden variant IDs cannot be used to edit a different product.
  await admin.reload();
  const [foreign] =
    await sql`select id from product_variants where product_id<>${product!.id} limit 1`;
  await admin.locator('input[name="variantId-0"]').evaluate((el, id) => {
    (el as HTMLInputElement).value = id;
  }, foreign!.id);
  await admin.getByRole("button", { name: "Save changes" }).click();
  await expect(admin.locator('[data-slot="alert"]')).toContainText(
    "variant list has changed",
  );
  expect(
    (await sql`select title from products where id=${product!.id}`)[0]!.title,
  ).toBe("Concurrent change");
});

test("workspace page search and skip navigation reach content directly", async ({
  admin,
}) => {
  await admin.goto("/admin");
  await admin.getByRole("button", { name: "Go to page", exact: true }).click();
  await admin
    .getByRole("dialog", { name: "Go to page", exact: true })
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await admin.keyboard.press("ControlOrMeta+k");
  const dialog = admin.getByRole("dialog", { name: "Go to page", exact: true });
  await dialog.getByLabel("Search admin pages").fill("inventory");
  await dialog.getByRole("link", { name: /^Inventory.*Products$/ }).click();
  await expect(admin).toHaveURL(/\/admin\/inventory$/);
  await expect(
    admin
      .locator("#admin-content")
      .getByRole("navigation", { name: "Admin", exact: true }),
  ).toHaveCount(0);
  const skip = admin.getByRole("link", {
    name: "Skip to content",
    exact: true,
  });
  await skip.focus();
  await skip.press("Enter");
  await expect(admin.locator("#admin-content")).toBeFocused();
});

test("management sidebar opens real sections and product editor fits mobile", async ({
  admin,
  sql,
}) => {
  const [sales] =
    await sql`select count(*)::int as count from orders where lifecycle_status in ('confirmed','completed') and created_at >= now() - interval '7 days'`;
  const hasSales = sales!.count > 0;
  for (const [label, path, heading] of [
    ["Overview", "/admin", "Commerce overview"],
    ["Orders", "/admin/orders", "Orders"],
    ["Payments", "/admin/payments", "Payments"],
    ["Products", "/admin/products", "Products"],
    ["Fulfillment", "/admin/fulfillment", "Fulfillment"],
    ["Promotions", "/admin/promotions", "Promotions"],
    ["Customers", "/admin/customers", "Customers"],
    ["Languages & translations", "/admin/translations", "Translations"],
    ["Settings", "/admin/setup", "Store setup"],
    ["Activity history", "/admin/activity", "Activity"],
  ]) {
    await admin.goto(path);
    await expect(admin).toHaveURL(new RegExp(`${path}$`));
    await expect(
      admin.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
    const link = admin
      .getByRole("navigation", { name: "Admin" })
      .getByRole("link", { name: label, exact: true });
    await expect(link).toHaveAttribute("href", path);
    if (
      [
        "Orders",
        "Payments",
        "Products",
        "Fulfillment",
        "Customers",
        "Settings",
      ].includes(label)
    ) {
      await expect(link).toHaveAttribute("data-active", "true");
    } else {
      await expect(link).toHaveAttribute("aria-current", "page");
    }
    if (path === "/admin") {
      await expect(admin.locator(".trend-day")).toHaveCount(7);
      await expect(admin.getByText("0 orders").first()).toBeVisible();
      await expect(
        admin.getByText("No net sales activity in the last 7 days."),
      ).toHaveCount(hasSales ? 0 : 1);
      await expect(
        admin.getByText("No overdue orders in this view."),
      ).toBeVisible();
      await expect(
        admin.getByText("No payouts or discrepancies to review."),
      ).toBeVisible();
      for (const width of [375, 768, 1440]) {
        await admin.setViewportSize({ width, height: 900 });
        expect(
          await admin.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        if (!hasSales)
          expect(
            await admin
              .locator(".sales-trend")
              .evaluate((element) => element.getBoundingClientRect().height),
          ).toBeLessThan(240);
      }
      await expect(
        admin.getByRole("heading", { name: "Payment evidence review" }),
      ).toHaveCount(0);
      await expect(
        admin.getByText("Unpaid orders and late receipts"),
      ).toHaveCount(0);
    }
  }
  await admin.goto("/admin/categories");
  await expect(
    admin
      .getByRole("navigation", { name: "Catalog sections" })
      .getByRole("link", { name: "Categories" }),
  ).toHaveAttribute("aria-current", "page");
  await admin.goto("/admin/products/import");
  await expect(admin.getByRole("navigation", { name: "Admin" })).toBeVisible();
  await expect(
    admin
      .getByRole("navigation", { name: "Catalog sections" })
      .getByRole("link", { name: "Import & export" }),
  ).toHaveAttribute("aria-current", "page");
  const [product] =
    await sql`select id from products where handle='studio-cup'`;
  await admin.goto(`/admin/products/${product!.id}/edit`);
  for (const width of [375, 768, 1440]) {
    await admin.setViewportSize({ width, height: 900 });
    expect(
      await admin.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await admin.setViewportSize({ width: 375, height: 900 });
  await expect(
    admin.getByRole("link", { name: "Overview", exact: true }),
  ).toBeHidden();
  await admin.getByRole("button", { name: "Open admin menu" }).click();
  await expect(
    admin.getByRole("link", { name: "Overview", exact: true }),
  ).toBeVisible();
  await admin.getByRole("button", { name: "Close admin menu" }).click();
  const scan = await new AxeBuilder({ page: admin }).analyze();
  expect(
    scan.violations.filter((v) =>
      ["critical", "serious"].includes(v.impact ?? ""),
    ),
  ).toEqual([]);
  await admin.screenshot({
    path: "test-results/product-editor-mobile.png",
    fullPage: true,
  });
  await admin.goto("/admin/products");
  const categoryFilter = admin.locator(".category-filter-picker");
  await categoryFilter.locator("summary").click();
  const categorySelect = categoryFilter.locator("select");
  await categorySelect.selectOption({ index: 1 });
  const categoryId = await categorySelect.inputValue();
  await expect(categoryFilter).not.toHaveAttribute("open");
  await expect(categoryFilter.locator("summary")).toBeFocused();
  await admin.getByRole("button", { name: "Filter", exact: true }).click();
  await expect(admin).toHaveURL(new RegExp(`category=${categoryId}`));
});

test("promotion codes apply to checkout and record one redemption", async ({
  admin,
  page,
  sql,
}) => {
  const code = `SAVE-${randomUUID().slice(0, 8)}`.toUpperCase();
  await admin.goto("/admin/promotions");
  await admin
    .getByRole("button", { name: "Create promotion", exact: true })
    .click();
  const create = admin.getByRole("dialog", { name: "Create promotion" });
  await create.getByLabel("Promotion name").fill("Checkout test");
  await create.getByLabel("Customer code").fill(code);
  await create.getByLabel("Discount value").fill("1000");
  await create.getByLabel("Minimum subtotal").fill("0");
  await create
    .getByRole("button", { name: "Create promotion", exact: true })
    .click();
  await expect(admin.getByRole("row").filter({ hasText: code })).toContainText(
    "Active",
  );

  await page.goto("/en/products/studio-cup");
  await page.getByRole("button", { name: "Add to bag" }).click();
  await page.getByRole("link", { name: "View bag", exact: true }).click();
  await page.getByRole("link", { name: "Continue to checkout" }).click();
  await page.getByLabel("Street address").fill("1 Promotion Street");
  await page.getByLabel("Promotion code").fill(code);
  await page
    .getByLabel("Payment method")
    .selectOption({ label: "Demo bank transfer" });
  await page.getByRole("button", { name: /Review your order/ }).click();
  await expect(page.getByText("Promotion code", { exact: true })).toBeVisible();
  await page.getByLabel("Your name").fill("Promotion Customer");
  await page.getByLabel("Email address").fill("promotion@example.test");
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: /Accept total & place order/ })
    .click();
  await expect(page).toHaveURL(/\/en\/orders\/[0-9a-f-]+$/);
  const orderId = new URL(page.url()).pathname.split("/").pop()!;
  const [order] =
    await sql`select discount_cents from orders where id=${orderId}`;
  expect(order!.discount_cents).toBeGreaterThan(0);
  expect(
    await sql`select id from promotion_redemptions where order_id=${orderId}`,
  ).toHaveLength(1);
});

test("long manual order dialogs keep the header and submit button reachable", async ({
  admin,
}) => {
  await admin.goto("/admin/orders");
  await admin
    .getByRole("button", { name: "Add manual order", exact: true })
    .click();
  const dialog = admin.getByRole("dialog", { name: "Add manual order" });
  for (let index = 0; index < 7; index++) {
    await dialog.getByRole("button", { name: "Add item", exact: true }).click();
  }
  for (const viewport of [
    { width: 1440, height: 1080 },
    { width: 375, height: 812 },
  ]) {
    await admin.setViewportSize(viewport);
    const submit = dialog.getByRole("button", {
      name: "Create order",
      exact: true,
    });
    await expect
      .poll(async () => {
        await dialog.evaluate((element) => {
          element.scrollTop = element.scrollHeight;
        });
        const bounds = await dialog.boundingBox();
        const button = await submit.boundingBox();
        return Boolean(
          bounds &&
          button &&
          button.y + button.height <= bounds.y + bounds.height,
        );
      })
      .toBe(true);
    await submit.click({ trial: true });
    await dialog
      .getByRole("button", { name: "Close", exact: true })
      .click({ trial: true });
  }
});

test("owner creates a manual order from the orders dialog", async ({
  admin,
  sql,
}) => {
  await admin.goto("/admin/orders");
  await admin.getByRole("button", { name: "Add manual order" }).click();
  const dialog = admin.getByRole("dialog", { name: "Add manual order" });
  const requestKey = await dialog
    .locator('input[name="requestKey"]')
    .inputValue();
  expect(requestKey).toMatch(/^[0-9a-f-]{36}$/);
  await dialog.getByLabel("Customer name").fill("Manual Customer");
  await dialog.getByLabel("Customer email").fill("manual@example.test");
  await dialog.getByLabel("Shipping address").fill("1 Manual Street");
  await dialog
    .getByLabel("Payment method")
    .selectOption({ label: "Demo bank transfer" });
  await dialog.getByLabel("Product variant").selectOption({ index: 1 });
  await dialog.getByRole("button", { name: "Create order" }).click();
  await expect(admin).toHaveURL(/\/admin\/orders\?created=ORD-/);
  await expect(
    admin.getByRole("alert").filter({ hasText: "Manual order ORD-" }),
  ).toBeVisible();
  const [created] =
    await sql`select source_cart_id from orders where guest_email='manual@example.test'`;
  expect(created!.source_cart_id).toBe(requestKey);
  await admin.getByRole("button", { name: "Add manual order" }).click();
  expect(
    await dialog.locator('input[name="requestKey"]').inputValue(),
  ).not.toBe(requestKey);
  await admin.keyboard.press("Escape");
  const orderRow = admin.getByRole("row").filter({
    hasText: "manual@example.test",
  });
  await orderRow.getByRole("link", { name: "View order", exact: true }).click();
  await expect(admin).toHaveURL(/\/admin\/orders\/[0-9a-f-]+\?back=/);
  await expect(
    admin.getByRole("button", { name: "Record payment", exact: true }),
  ).toBeVisible();
  expect(
    await sql`select id from orders where guest_email='manual@example.test'`,
  ).toHaveLength(1);
});

for (const scheduled of [false, true]) {
  test(`owner creates a ${scheduled ? "scheduled" : "unscheduled"} manual pickup without a shipping address`, async ({
    admin,
    sql,
  }) => {
    const schedule = Object.fromEntries(
      ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].map((day) => [
        day,
        [["12:00", "13:00"]],
      ]),
    );
    const [location] =
      await sql`insert into pickup_location(name,address,weekly_schedule,prep_minutes,schedule_required) values('Manual pickup test','Pickup counter',${JSON.stringify(schedule)}::jsonb,0,${scheduled}) returning id`;
    await admin.goto("/admin/orders");
    await admin.getByRole("button", { name: "Add manual order" }).click();
    const dialog = admin.getByRole("dialog", { name: "Add manual order" });
    await dialog.getByLabel("Customer name").fill("Manual pickup customer");
    const email = `manual-pickup-${scheduled}@example.test`;
    await dialog.getByLabel("Customer email").fill(email);
    await dialog
      .getByLabel("Fulfillment", { exact: true })
      .selectOption("pickup");
    await expect(
      dialog.getByLabel("Shipping address", { exact: true }),
    ).toHaveCount(0);
    await dialog.getByLabel("Pickup location").selectOption(location!.id);
    if (scheduled) {
      await dialog
        .getByLabel("Pickup date")
        .fill(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
      await dialog.getByLabel("Pickup time").fill("12:00");
    }
    await dialog
      .getByLabel("Payment method")
      .selectOption({ label: "Demo bank transfer" });
    await dialog.getByLabel("Product variant").selectOption({ index: 1 });
    await dialog.getByRole("button", { name: "Create order" }).click();
    await expect(admin).toHaveURL(/\/admin\/orders\?created=ORD-/);
    await expect(dialog).toBeHidden();
    const [order] =
      await sql`select fulfillment_type,terms_snapshot from orders where guest_email=${email}`;
    expect(order!.fulfillment_type).toBe("pickup");
    expect(order!.terms_snapshot.pickup.locationId).toBe(location!.id);
    expect(Boolean(order!.terms_snapshot.pickup.date)).toBe(scheduled);
  });
}

for (const rejection of ["full", "blackout"] as const) {
  test(`manual pickup retains entered details after ${rejection} rejection and retries once`, async ({
    admin,
    sql,
  }) => {
    const date = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const schedule = Object.fromEntries(
      ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].map((day) => [
        day,
        [["12:00", "13:00"]],
      ]),
    );
    const [location] =
      await sql`insert into pickup_location(name,address,weekly_schedule,prep_minutes,schedule_required,slot_capacity,blackout_dates) values('Recovery pickup','Pickup counter',${JSON.stringify(schedule)}::jsonb,0,true,${rejection === "full" ? 0 : 1},${JSON.stringify(rejection === "blackout" ? [date] : [])}::jsonb) returning id`;
    await admin.goto("/admin/orders");
    await admin.getByRole("button", { name: "Add manual order" }).click();
    const dialog = admin.getByRole("dialog", { name: "Add manual order" });
    const email = `manual-recovery-${rejection}@example.test`;
    await dialog.getByLabel("Customer name").fill("Recovery customer");
    await dialog.getByLabel("Customer email").fill(email);
    await dialog
      .getByLabel("Fulfillment", { exact: true })
      .selectOption("pickup");
    await dialog.getByLabel("Pickup location").selectOption(location!.id);
    await dialog.getByLabel("Pickup date").fill(date);
    await dialog.getByLabel("Pickup time").fill("12:00");
    await dialog
      .getByLabel("Payment method")
      .selectOption({ label: "Demo bank transfer" });
    await dialog.getByLabel("Product variant").selectOption({ index: 1 });
    await dialog.getByLabel("Quantity", { exact: true }).fill("2");
    const requestKey = await dialog
      .locator('input[name="requestKey"]')
      .inputValue();
    const variant = await dialog.getByLabel("Product variant").inputValue();
    const payment = await dialog.getByLabel("Payment method").inputValue();
    await dialog.getByRole("button", { name: "Create order" }).click();
    await expect(dialog.getByRole("alert")).toHaveText(
      rejection === "full"
        ? "This fulfillment slot is full. Choose another time."
        : "This pickup slot is closed, past, or does not allow enough preparation time.",
    );
    await expect(dialog.getByLabel("Customer name")).toHaveValue(
      "Recovery customer",
    );
    await expect(dialog.getByLabel("Customer email")).toHaveValue(email);
    await expect(dialog.getByLabel("Fulfillment", { exact: true })).toHaveValue(
      "pickup",
    );
    await expect(dialog.getByLabel("Pickup location")).toHaveValue(
      location!.id,
    );
    await expect(dialog.getByLabel("Pickup date")).toHaveValue(date);
    await expect(dialog.getByLabel("Pickup time")).toHaveValue("12:00");
    await expect(dialog.getByLabel("Product variant")).toHaveValue(variant);
    await expect(dialog.getByLabel("Quantity", { exact: true })).toHaveValue(
      "2",
    );
    await expect(dialog.getByLabel("Payment method")).toHaveValue(payment);
    await expect(dialog.locator('input[name="requestKey"]')).toHaveValue(
      requestKey,
    );
    expect(await sql`select id from carts where id=${requestKey}`).toHaveLength(
      0,
    );
    expect(
      await sql`select id from orders where source_cart_id=${requestKey}`,
    ).toHaveLength(0);
    await sql`update pickup_location set blackout_dates='[]'::jsonb, slot_capacity=1 where id=${location!.id}`;
    await dialog.getByRole("button", { name: "Create order" }).click();
    await expect(admin).toHaveURL(/\/admin\/orders\?created=ORD-/);
    await expect(dialog).toBeHidden();
    const orders =
      await sql`select id from orders where source_cart_id=${requestKey}`;
    expect(orders).toHaveLength(1);
    expect(
      await sql`select id from slot_reservations where order_id=${orders[0]!.id}`,
    ).toHaveLength(1);
  });
}

test("staff can see submitted payment evidence in the review grid", async ({
  page,
  admin,
  sql,
}) => {
  const order = await checkout(page, sql);
  await page.getByLabel("Payment image", { exact: false }).setInputFiles({
    name: "payment-proof.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await page
    .getByRole("button", { name: "Upload evidence", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText(
    "Evidence received. This is not a payment receipt.",
    { timeout: 20000 },
  );

  await admin.goto("/admin/payments#evidence");
  const image = admin.getByRole("img", {
    name: `Payment evidence submitted for order ${order.reference_code}`,
  });
  await expect(image).toBeVisible();
  await expect
    .poll(() =>
      image.evaluate((element: HTMLImageElement) => element.naturalWidth),
    )
    .toBeGreaterThan(0);
  const evidenceCard = admin
    .locator(".evidence-card")
    .filter({ hasText: order.reference_code });
  await evidenceCard.getByRole("button", { name: "Review evidence" }).click();
  const review = admin.getByRole("dialog", {
    name: `Payment evidence · ${order.reference_code}`,
  });
  await expect(
    review.getByRole("heading", {
      name: `Order details · ${order.reference_code}`,
    }),
  ).toBeVisible();
  const lines =
    await sql`select quantity, catalog_snapshot from order_items where order_id=${order.id}`;
  for (const line of lines) {
    const row = review
      .getByRole("row")
      .filter({ hasText: line.catalog_snapshot.sku });
    await expect(row).toBeVisible();
    await expect(
      row.getByRole("cell", { name: String(line.quantity), exact: true }),
    ).toBeVisible();
  }
  await expect(
    review.getByText("External payment total:", { exact: false }),
  ).toBeVisible();
  await expect(
    review.getByRole("heading", { name: "Fulfillment", exact: true }),
  ).toBeVisible();
  await expect(
    review.getByRole("img", {
      name: `Full-size payment evidence submitted for order ${order.reference_code}`,
    }),
  ).toBeVisible();
  await expect(
    review.getByRole("link", { name: /Open original/ }),
  ).toHaveAttribute("target", "_blank");
  await review.getByRole("button", { name: "Zoom in evidence" }).click();
  await expect(review.getByText("150%", { exact: true })).toBeVisible();
  await review.getByRole("button", { name: "Fit image" }).click();
  await expect(review.getByText("100%", { exact: true })).toBeVisible();
  const [account] =
    await sql`select id from payment_accounts where is_active=true and account_type <> 'cash' limit 1`;
  await review
    .getByLabel("Receiving account", { exact: true })
    .selectOption(account!.id);
  await review
    .getByLabel("Actual received amount", { exact: false })
    .fill((order.purchase_total_cents / 100).toFixed(2));
  const reference = `EVIDENCE-${randomUUID()}`;
  await review
    .getByLabel("Actual payment reference", { exact: true })
    .fill(reference);
  await review
    .getByRole("checkbox", { name: /I verified the actual receiving/ })
    .check();
  await review
    .getByRole("button", { name: "Record receipt", exact: true })
    .click();
  await expect(admin).toHaveURL(/\/admin\/payments\?reviewEvidence=/);
  await expect(review.getByText(reference, { exact: false })).toBeVisible();
  await review
    .getByRole("button", { name: "Confirm exact payment", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (
          await sql`select lifecycle_status from orders where id=${order.id}`
        )[0]!.lifecycle_status,
    )
    .toBe("confirmed");
  await expect(admin).toHaveURL(/\/admin\/payments/);
  await admin.goto(`/admin/orders/${order.id}`);
  await expect(
    admin.getByRole("heading", { name: "Payment evidence & receipts" }),
  ).toBeVisible();
  await expect(
    admin.getByRole("img", {
      name: `Payment evidence submitted for order ${order.reference_code}`,
      exact: true,
    }),
  ).toBeVisible();
});

test("owner selects orders before exporting instead of exporting every order", async ({
  page,
  admin,
  sql,
}) => {
  const first = await checkout(page, sql);
  const second = await checkout(page, sql);
  await admin.goto("/admin/orders");
  await expect(admin.getByLabel("Orders to export")).toHaveValue("selected");
  const exportButton = admin.getByRole("button", {
    name: "Export orders CSV",
    exact: true,
  });
  await expect(exportButton).toBeDisabled();
  await admin
    .getByRole("checkbox", {
      name: `Select order ${first.reference_code}`,
      exact: true,
    })
    .check();
  const download = admin.waitForEvent("download");
  await exportButton.click();
  const file = await download;
  const stream = await file.createReadStream();
  let csv = "";
  for await (const chunk of stream!) csv += chunk.toString();
  expect(csv).toContain(first.reference_code);
  expect(csv).not.toContain(second.reference_code);
  await admin.getByLabel("Search orders").fill(first.reference_code);
  await admin.getByRole("button", { name: "Filter", exact: true }).click();
  await expect(exportButton).toBeDisabled();
});

test("staff filters the payment ledger and opens payment management", async ({
  page,
  admin,
  sql,
}) => {
  const order = await checkout(page, sql);
  const paymentReference = `PAY-${randomUUID().slice(0, 8)}`;
  await record(
    admin,
    order.reference_code,
    order.purchase_total_cents,
    paymentReference,
  );

  await admin.goto("/admin/payments");
  await admin.getByLabel("Search payments").fill("CUJ Customer");
  await admin.getByLabel("Order status").selectOption("unpaid");
  await admin.getByLabel("Payment type").selectOption("other");
  await admin.getByRole("button", { name: "Filter", exact: true }).click();
  await expect(admin).toHaveURL(
    /paymentQ=CUJ\+Customer.*paymentStatus=unpaid.*paymentType=other/,
  );

  const row = admin.getByRole("row").filter({ hasText: order.reference_code });
  await expect(row).toContainText(
    paymentReference.replace(/[^a-z0-9]/gi, "").toUpperCase(),
  );
  await expect(row).toContainText(order.reference_code);
  await expect(row).toContainText("CUJ Customer");
  await expect(row).toContainText("other");
  await row.getByRole("link", { name: "Manage" }).click();
  await expect(admin).toHaveURL(/managePayment=[0-9a-f-]+#payment-/);
  await expect(
    admin.locator(`details#payment-${order.id}[open]`),
  ).toBeVisible();
});
