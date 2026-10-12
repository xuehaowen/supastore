import { test, expect, clickAction } from "./fixtures";

for (const mode of ["shipping", "pickup", "none"] as const) {
  test(`${mode}-only checkout respects commerce policies`, async ({
    page,
    sql,
  }) => {
    const [saved] =
      await sql`select commerce_policy from store_settings limit 1`;
    try {
      const policy = {
        ...saved!.commerce_policy,
        shippingEnabled: mode === "shipping",
        pickupEnabled: mode === "pickup",
        deliveryEnabled: false,
      };
      await sql`update store_settings set commerce_policy=${sql.json(policy)}, quote_version=quote_version+1`;
      await page.goto("/en/products/studio-cup");
      await page.getByRole("button", { name: "Add to bag" }).click();
      await page.getByRole("link", { name: "Continue to checkout" }).click();
      await expect(page.locator('input[name="fulfillmentType"]')).toHaveCount(
        mode === "none" ? 0 : 1,
      );
      if (mode === "none") {
        await expect(page.getByRole("status")).toContainText(
          "No fulfillment methods",
        );
        await expect(
          page.getByRole("button", { name: /Review your order/ }),
        ).toBeDisabled();
      } else {
        await expect(
          page.getByRole("radio", {
            name: mode === "shipping" ? "Shipping" : "Local pickup",
            exact: true,
          }),
        ).toBeChecked();
        await expect(
          page.getByRole("radio", {
            name: mode === "shipping" ? "Local pickup" : "Shipping",
            exact: true,
          }),
        ).toHaveCount(0);
      }
    } finally {
      await sql`update store_settings set commerce_policy=${sql.json(saved!.commerce_policy)}, quote_version=quote_version+1`;
    }
  });
}

for (const scheduled of [false, true]) {
  test(`delivery-only checkout supports ${scheduled ? "scheduled" : "unscheduled"} delivery and edit`, async ({
    page,
    sql,
  }) => {
    const [saved] =
      await sql`select commerce_policy from store_settings limit 1`;
    const [area] =
      await sql`insert into delivery_areas(name,country_codes,postal_prefixes,rate_cents,schedule_required,weekly_schedule) values('CUJ delivery','["US"]'::jsonb,'["94"]'::jsonb,700,${scheduled},'{"mon":[["09:00","17:00"]],"tue":[["09:00","17:00"]],"wed":[["09:00","17:00"]],"thu":[["09:00","17:00"]],"fri":[["09:00","17:00"]],"sat":[["09:00","17:00"]],"sun":[["09:00","17:00"]]}'::jsonb) returning id`;
    let activeAreaId: string = area!.id;
    try {
      const policy = {
        ...saved!.commerce_policy,
        shippingEnabled: false,
        pickupEnabled: false,
        deliveryEnabled: true,
      };
      await sql`update store_settings set commerce_policy=${sql.json(policy)}, quote_version=quote_version+1`;
      await page.goto("/en/products/studio-cup");
      await page.getByRole("button", { name: "Add to bag" }).click();
      await page.getByRole("link", { name: "Continue to checkout" }).click();
      await expect(
        page.getByRole("radio", { name: "Local delivery", exact: true }),
      ).toBeChecked();
      await expect(page.locator('input[name="fulfillmentType"]')).toHaveCount(
        1,
      );
      await page.getByLabel("Street address").fill("1 Market Street");
      await page.getByLabel("ZIP / postal code").fill("94105");
      if (scheduled) {
        await page
          .locator("button.pickup-calendar-day-btn:not([disabled])")
          .first()
          .click();
        await page
          .getByLabel("Delivery window", { exact: true })
          .selectOption({ index: 1 });
      }
      await page.getByRole("button", { name: /Review your order/ }).click();
      await page.waitForURL(/quote=/);
      const quoteId = new URL(page.url()).searchParams.get("quote");
      const [quote] =
        await sql`select shipping_cents,terms_snapshot from quotes where id=${quoteId}`;
      expect(quote!.shipping_cents).toBe(700);
      expect(quote!.terms_snapshot.delivery.areaId).toBe(area!.id);
      await expect(
        page.getByText("Local delivery", { exact: true }),
      ).toBeVisible();
      await page.getByRole("link", { name: "Edit fulfillment" }).click();
      await expect(
        page.getByLabel("Delivery area", { exact: true }),
      ).toHaveValue(area!.id);
      await expect(page.getByLabel("ZIP / postal code")).toHaveValue("94105");
      if (scheduled) {
        await expect(
          page.getByLabel("Delivery window", { exact: true }),
        ).toHaveValue("09:00");
        const [replacement] =
          await sql`insert into delivery_areas(name,country_codes,postal_prefixes,rate_cents,schedule_required,weekly_schedule) select 'Replacement delivery',country_codes,postal_prefixes,rate_cents,schedule_required,weekly_schedule from delivery_areas where id=${area!.id} returning id`;
        activeAreaId = replacement!.id;
        await sql`update delivery_areas set is_active=false where id=${area!.id}`;
        await sql`update store_settings set quote_version=quote_version+1`;
        await page.reload();
        await expect(
          page.getByLabel("Delivery area", { exact: true }),
        ).toHaveValue(activeAreaId);
        await expect(
          page.getByLabel("Delivery window", { exact: true }),
        ).toHaveValue("");
        await expect(page.locator('input[name="pickupDate"]')).toHaveValue("");
        await page
          .locator("button.pickup-calendar-day-btn:not([disabled])")
          .first()
          .click();
        await page
          .getByLabel("Delivery window", { exact: true })
          .selectOption({ index: 1 });
      }
      await page.getByRole("button", { name: /Review your order/ }).click();
      await page.waitForURL((url) => !url.searchParams.has("edit"));
      await page.getByLabel("Your name").fill("Delivery customer");
      await page.getByLabel("Email address").fill("delivery@example.test");
      await page.getByRole("checkbox").check();
      await clickAction(
        page,
        page.getByRole("button", { name: /Accept total & place order/ }),
      );
      await expect(page).toHaveURL(/\/en\/orders\/[a-f0-9-]+$/);
      const orderId = new URL(page.url()).pathname.split("/").pop()!;
      const [order] =
        await sql`select fulfillment_type,shipping_address_snapshot,terms_snapshot from orders where id=${orderId}`;
      expect(order!.fulfillment_type).toBe("local_delivery");
      expect(order!.shipping_address_snapshot.postalCode).toBe("94105");
      if (scheduled) {
        const [reservation] =
          await sql`select r.id from slot_reservations r join fulfillment_slots s on s.id=r.slot_id where r.order_id=${orderId} and s.delivery_area_id=${activeAreaId}`;
        expect(reservation).toBeTruthy();
      }
    } finally {
      await sql`update delivery_areas set is_active=false where id=${area!.id}`;
      await sql`update delivery_areas set is_active=false where id=${activeAreaId}`;
      await sql`update store_settings set commerce_policy=${sql.json(saved!.commerce_policy)}, quote_version=quote_version+1`;
    }
  });
}
