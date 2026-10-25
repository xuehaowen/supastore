import {
  test,
  expect,
  clickAction,
  record,
  confirm,
  openOrder,
} from "./fixtures";
import { randomUUID } from "node:crypto";

for (const method of ["pickup", "shipping"] as const) {
  test(`${method}-only manual-payment store completes its intended sales path`, async ({
    page,
    admin,
    sql,
  }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    const [original] =
      await sql`select commerce_policy from store_settings limit 1`;
    const [location] =
      await sql`insert into pickup_location(name,address,weekly_schedule,prep_minutes,schedule_required) values(${"Manual launch " + randomUUID()},'Synthetic pickup instructions','{}'::jsonb,0,false) returning id`;
    try {
      await sql`update store_settings set commerce_policy=${sql.json({ ...original!.commerce_policy, shippingEnabled: method === "shipping", pickupEnabled: method === "pickup", deliveryEnabled: false })}`;
      await page.goto("/en/products/studio-cup");
      await page.getByRole("button", { name: "Add to bag" }).click();
      await page.getByRole("link", { name: "View bag", exact: true }).click();
      await page.getByRole("link", { name: "Continue to checkout" }).click();
      const methods = page.locator('input[name="fulfillmentType"]');
      await expect(methods).toHaveCount(1);
      await expect(methods).toHaveValue(method);
      await expect(methods).toBeChecked();
      if (method === "pickup") {
        await expect(page.getByLabel("Street address")).toHaveCount(0);
        await page
          .locator(`input[name="pickupLocationId"][value="${location!.id}"]`)
          .check();
      } else {
        await expect(
          page.locator('input[name="pickupLocationId"]'),
        ).toHaveCount(0);
        await page
          .getByLabel("Street address")
          .fill("1 Synthetic shipping street");
      }
      await expect(
        page.getByRole("option", { name: /online|stripe|card payment/i }),
      ).toHaveCount(0);
      await page
        .getByLabel("Payment method")
        .selectOption({ label: "Demo bank transfer" });
      await page.getByRole("button", { name: /Review your order/ }).click();
      await page.getByLabel("Your name").fill("Manual launch buyer");
      await page.getByLabel("Email address").fill("manual-launch@example.test");
      await page.getByRole("checkbox").check();
      await clickAction(
        page,
        page.getByRole("button", { name: /Accept total & place order/ }),
      );
      await expect(page).toHaveURL(/\/en\/orders\/[0-9a-f-]+$/);
      const orderId = new URL(page.url()).pathname.split("/").pop()!;
      const [order] =
        await sql`select reference_code,purchase_total_cents,lifecycle_status,terms_snapshot from orders where id=${orderId}`;
      expect(order!.lifecycle_status).toBe("unpaid");
      expect(order!.purchase_total_cents).toBeGreaterThan(0);
      expect(order!.terms_snapshot.fulfillmentType).toBe(method);
      expect(order!.terms_snapshot.onlinePayment).toBe(false);
      await expect(
        page.getByText("Payment instructions", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: /pay.*card/i }),
      ).toHaveCount(0);
      await record(admin, order!.reference_code, order!.purchase_total_cents);
      await confirm(admin, order!.reference_code);
      if (method === "pickup") {
        await admin.goto(`/admin/orders/${orderId}`);
        await clickAction(
          admin,
          admin.getByRole("button", {
            name: "Mark ready for pickup",
            exact: true,
          }),
        );
        await admin
          .getByRole("button", { name: "Complete pickup handoff", exact: true })
          .click();
        const handoff = admin.getByRole("dialog", {
          name: "Verify pickup recipient",
        });
        await handoff
          .getByLabel("Recipient / authorized recipient")
          .fill("Manual launch buyer");
        await clickAction(
          admin,
          handoff.getByRole("button", {
            name: "Complete pickup handoff",
            exact: true,
          }),
        );
      } else {
        const row = await openOrder(admin, order!.reference_code);
        await row
          .getByRole("link", { name: "Prepare shipment", exact: true })
          .click();
        for (const [button, dialog] of [
          ["Dispatch shipment", "Dispatch shipment"],
          ["Record delivery", "Record completed delivery"],
        ]) {
          await admin
            .getByRole("button", { name: button!, exact: true })
            .click();
          const form = admin.getByRole("dialog", {
            name: dialog!,
            exact: true,
          });
          await form
            .getByLabel("Carrier or delivery method")
            .fill("Synthetic carrier");
          await form.getByLabel("Tracking number").fill("MANUAL-LAUNCH");
          await clickAction(
            admin,
            form.getByRole("button", { name: button!, exact: true }),
          );
        }
      }
      await page.reload();
      await expect(page.getByText(/Completed · Fulfilled/)).toBeVisible();
      const receipts =
        await sql`select amount_cents from payment_receipts where order_id=${orderId}`;
      expect(receipts).toHaveLength(1);
      expect(receipts[0]!.amount_cents).toBe(order!.purchase_total_cents);
    } finally {
      await sql`update store_settings set commerce_policy=${sql.json(original!.commerce_policy)}`;
    }
  });
}
