import { randomUUID } from "node:crypto";
import type { CustomerPageModels } from "@supastore/contracts";
import { parseCustomerPage } from "@supastore/contracts/customer-page-validation";
import { test, expect, checkout } from "./fixtures";

test("a store with the persisted migration-default policy remains browseable", async ({
  page,
  sql,
}) => {
  const [saved] = await sql`select commerce_policy from store_settings limit 1`;
  const legacy = {
    guestCheckout: true,
    rewardsEnabled: false,
    rewardRateBasisPoints: 500,
    shippingEnabled: true,
    pickupEnabled: true,
    salesThresholdCents: null,
  };
  try {
    await sql`update store_settings set commerce_policy=${sql.json(legacy)}`;
    const response = await page.request.get(
      "/api/v1/customer-pages/layout?locale=en",
    );
    expect(response.status()).toBe(200);
    const { data } = await response.json();
    expect(() => parseCustomerPage("layout", data)).not.toThrow();
    expect(data.store.commercePolicy.deliveryEnabled).toBe(false);
    await page.goto("/en/products/studio-cup");
    await expect(
      page.getByRole("button", { name: "Add to bag", exact: true }),
    ).toBeVisible();
  } finally {
    await sql`update store_settings set commerce_policy=${sql.json(saved!.commerce_policy)}`;
  }
});

test("actual serialized backend responses match every customer page decoder", async ({
  page,
  sql,
}) => {
  const handle = `contract-${randomUUID()}`;
  await sql`insert into product_collections(handle,title,is_published) values(${handle},'Contract collection',true)`;
  try {
    const order = await checkout(page, sql);
    const [saved] = await sql`select quote_id from orders where id=${order.id}`;
    const queries: Record<keyof CustomerPageModels, string> = {
      layout: "",
      catalog: "",
      product: "&handle=studio-cup",
      cart: "",
      checkout: `&quote=${saved!.quote_id}`,
      account: "",
      order: `&id=${order.id}`,
      collection: `&handle=${handle}`,
    };
    for (const [name, query] of Object.entries(queries)) {
      const response = await page.request.get(
        `/api/v1/customer-pages/${name}?locale=en${query}`,
      );
      expect(response.status(), name).toBe(200);
      const { data } = await response.json();
      expect(
        () => parseCustomerPage(name as keyof CustomerPageModels, data),
        name,
      ).not.toThrow();
      if (name === "checkout") expect(data.savedQuote.id).toBe(saved!.quote_id);
      if (name === "order")
        expect(data.result.order.referenceCode).toBe(order.reference_code);
    }
  } finally {
    await sql`delete from product_collections where handle=${handle}`;
  }
});
