import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
const active = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/infrastructure/db", () => ({
  get db() {
    return active.db;
  },
}));
import * as schema from "@/infrastructure/db/schema";
import { createProduct } from "@/application/use-cases/catalog/create-product";
import { addToCart } from "@/application/use-cases/cart/add-to-cart";
import { getQuote } from "@/application/use-cases/get-quote";
import { createOrder } from "@/application/use-cases/create-order";
import { updateStoreSettings } from "@/application/use-cases/store/update-store-settings";
import { commerceRules, type CommerceRule } from "@/domain/commerce-evaluation";
import { customerAccount } from "@/application/use-cases/customers/customer-ownership";
import { previewCommerce } from "@/application/use-cases/commerce/preview-commerce";
import {
  savePromotion,
  setPromotionActive,
} from "@/application/use-cases/promotions/manage-promotions";
import { removeProductVariant } from "@/application/use-cases/catalog/manage-catalog";
import { updateCartItem } from "@/application/use-cases/cart/update-cart-item";
import {
  saveCommerceRule,
  deleteCommerceRule,
} from "@/application/use-cases/commerce/manage-commerce-rules";

const server = process.env.TRANSLATION_TEST_DATABASE_URL;
describe.skipIf(!server)("contextual commerce PostgreSQL", () => {
  const name = `evaluation_${randomUUID().replaceAll("-", "")}`;
  const owner = "evaluation-owner";
  let admin: ReturnType<typeof postgres>,
    client: ReturnType<typeof postgres>,
    bank: string,
    variant: string,
    pickup: string;
  beforeAll(async () => {
    admin = postgres(server!);
    await admin.unsafe(
      `CREATE DATABASE "${name}" TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C'`,
    );
    const url = new URL(server!);
    url.pathname = `/${name}`;
    client = postgres(url.toString(), { max: 10, onnotice: () => {} });
    active.db = drizzle(client, { schema });
    await migrate(active.db as ReturnType<typeof drizzle>, {
      migrationsFolder: "apps/backend/src/infrastructure/db/migrations",
    });
    await client`insert into staff_memberships(user_id,email,role) values(${owner},'owner@evaluation.test','owner'),('evaluation-staff','staff@evaluation.test','staff')`;
    await client`insert into store_settings(store_name,support_email,setup_completed,email_verified_at,commerce_policy) values('Evaluation fixture','support@evaluation.test',true,now(),' {"rewardsEnabled":true,"rewardRateBasisPoints":500}'::jsonb)`;
    bank = (
      await client`insert into payment_accounts(account_name,account_identifier) values('Manual fixture','Instructions') returning id`
    )[0]!.id;
    pickup = (
      await client`insert into pickup_location(name,address,weekly_schedule,schedule_required) values('Pickup fixture','Private fixture location','{}',false) returning id`
    )[0]!.id;
    await client`insert into shipping_zones(name,rate_cents,free_threshold_cents) values('Default',800,2000)`;
    variant = (
      await createProduct({
        staffUserId: owner,
        title: "Example product",
        handle: randomUUID(),
        variants: [{ sku: randomUUID(), title: "Default", priceCents: 1000 }],
      })
    ).variants[0]!.id;
    await client`insert into promotions(code,name,discount_type,discount_value) values('SAVE','Fixture discount','fixed',500)`;
  }, 30000);
  beforeEach(async () => {
    await client`update store_settings set commerce_rules='[]'::jsonb,quote_version=quote_version+1`;
    await client`update variant_stock set tracking_enabled=false,on_hand=0,reserved=0 where variant_id=${variant}`;
  });
  afterAll(async () => {
    if (client) await client.end();
    if (admin) {
      await admin.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await admin.end();
    }
  });
  function rule(
    kind: CommerceRule["kind"],
    value: number,
    extra: Record<string, unknown> = {},
  ) {
    return commerceRules([
      {
        id: randomUUID(),
        name: "Fixture rule",
        kind,
        value,
        priority: 10,
        conditions: {},
        ...extra,
      },
    ])[0]!;
  }
  async function save(rules: CommerceRule[]) {
    return updateStoreSettings({ staffUserId: owner, commerceRules: rules });
  }
  async function quote(
    extra: Partial<Parameters<typeof getQuote>[0]> = {},
    quantity = 1,
  ) {
    const guestSessionId = randomUUID();
    const cart = await addToCart({
      guestSessionId,
      variantId: variant,
      quantity,
    });
    const q = await getQuote({
      cartId: cart.id,
      guestSessionId,
      fulfillmentType: "shipping",
      shippingAddress: { country: "US", region: "CA", address: "1 Fixture St" },
      paymentAccountId: bank,
      ...extra,
    });
    return { q, guestSessionId };
  }
  function place(
    quoted: Awaited<ReturnType<typeof quote>>,
    customerUserId?: string,
  ) {
    return createOrder({
      quoteId: quoted.q.id,
      guestSessionId: quoted.guestSessionId,
      guestName: "Fixture",
      guestEmail: "customer@evaluation.test",
      ...(customerUserId ? { customerUserId } : {}),
    });
  }
  it("migrates neutral defaults and saves only owner-authorized, versioned rules", async () => {
    const [before] =
      await client`select quote_version,commerce_rules from store_settings`;
    expect(before!.commerce_rules).toEqual([]);
    const configured = [rule("reward", 0)];
    await expect(
      updateStoreSettings({
        staffUserId: "evaluation-staff",
        commerceRules: configured,
      }),
    ).rejects.toThrow();
    await save(configured);
    const [after] =
      await client`select quote_version,commerce_rules from store_settings`;
    expect(after!.commerce_rules).toEqual(configured);
    expect(after!.quote_version).toBe(before!.quote_version + 1);
    await updateStoreSettings({
      staffUserId: owner,
      storeName: "Renamed fixture",
    });
    expect(
      (await client`select commerce_rules from store_settings`)[0]!
        .commerce_rules,
    ).toEqual(configured);
  });
  it("quotes contextual prices, snapshots terms and rejects stale rules without rewriting accepted orders", async () => {
    const price = rule("price", 1200, {
      variantIds: [variant],
      conditions: { countries: ["US"], regions: ["CA"] },
    });
    await save([price]);
    const first = await quote();
    const stale = await quote();
    expect(first.q.merchandiseSubtotalCents).toBe(1200);
    const accepted = await place(first);
    await save([{ ...price, value: 1300 }]);
    await expect(place(stale)).rejects.toThrow(/changed/);
    expect(
      (
        await client`select unit_price_cents from order_items where order_id=${accepted.id}`
      )[0]!.unit_price_cents,
    ).toBe(1200);
    expect(
      (accepted.termsSnapshot as { evaluation: { matchedRuleIds: string[] } })
        .evaluation.matchedRuleIds,
    ).toContain(price.id);
  });
  it("blocks contextual exclusions and unknown required destination details", async () => {
    await save([
      rule("availability", 0, {
        variantIds: [variant],
        conditions: { fulfillmentMethods: ["shipping"] },
      }),
    ]);
    await expect(quote()).rejects.toThrow(/not offered|unavailable/i);
    expect(
      (
        await quote({
          fulfillmentType: "pickup",
          pickupLocationId: pickup,
          shippingAddress: { country: "", address: "" },
        })
      ).q.merchandiseSubtotalCents,
    ).toBe(1000);
    await save([
      rule("price", 1200, {
        variantIds: [variant],
        conditions: { countries: ["US"], regions: ["CA"] },
      }),
    ]);
    await expect(
      quote({ shippingAddress: { country: "US", address: "1 Fixture St" } }),
    ).rejects.toThrow(/destination|context|region/i);
  });
  it("evaluates free-shipping thresholds after merchandise discounts and applies contextual campaigns", async () => {
    expect((await quote({ promotionCode: "SAVE" }, 2)).q.shippingCents).toBe(
      800,
    );
    await save([
      rule("free_shipping", 1500, {
        conditions: { countries: ["US"], regions: ["CA"] },
      }),
    ]);
    expect((await quote({ promotionCode: "SAVE" }, 2)).q.shippingCents).toBe(0);
    await save([
      rule("free_shipping", 3000, {
        conditions: { countries: ["US"], regions: ["CA"] },
      }),
    ]);
    expect((await quote({}, 2)).q.shippingCents).toBe(800);
    await save([
      rule("promotion", 0, {
        promotionCode: "SAVE",
        conditions: { fulfillmentMethods: ["pickup"] },
      }),
    ]);
    await expect(quote({ promotionCode: "SAVE" })).rejects.toThrow(
      /promotion.*(eligible|available)/i,
    );
  });
  it("snapshots the selected reward rate only for verified customers", async () => {
    await save([
      rule("reward", 100, { conditions: { fulfillmentMethods: ["shipping"] } }),
      rule("reward", 500, {
        priority: 20,
        conditions: {
          fulfillmentMethods: ["pickup"],
          pickupLocationIds: [pickup],
        },
      }),
    ]);
    const id = randomUUID();
    await client`insert into "user"(id,name,email,email_verified) values(${id},'Fixture',${`${id}@evaluation.test`},true)`;
    await customerAccount(id);
    const shipped = await place(await quote(), id);
    expect(shipped.rewardSnapshot).toMatchObject({ rateBasisPoints: 100 });
    const collected = await place(
      await quote({
        fulfillmentType: "pickup",
        pickupLocationId: pickup,
        shippingAddress: { country: "", address: "" },
      }),
      id,
    );
    expect(collected.rewardSnapshot).toMatchObject({ rateBasisPoints: 500 });
    expect((await place(await quote())).rewardSnapshot).toBeNull();
  });
  it("does not reserve on evaluation and cannot oversell when two orders compete", async () => {
    await client`update variant_stock set tracking_enabled=true,on_hand=1,reserved=0 where variant_id=${variant}`;
    const one = await quote();
    const two = await quote();
    expect(
      (
        await client`select reserved from variant_stock where variant_id=${variant}`
      )[0]!.reserved,
    ).toBe(0);
    const attempts = await Promise.allSettled([place(one), place(two)]);
    expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(1);
    expect(
      (
        await client`select reserved from variant_stock where variant_id=${variant}`
      )[0]!.reserved,
    ).toBe(1);
  });
  it("previews current public prices and stock without exposing rules or reserving", async () => {
    await save([
      rule("price", 1250, {
        variantIds: [variant],
        conditions: { countries: ["US"], regions: ["CA"] },
      }),
    ]);
    const result = await previewCommerce({
      items: [{ variantId: variant, quantity: 2 }],
      context: { fulfillmentType: "shipping", country: "US", region: "CA" },
    });
    expect(result.evaluation.items[0]).toMatchObject({
      unitPriceCents: 1250,
      available: true,
    });
    expect(result.evaluation.merchandiseSubtotalCents).toBe(2500);
    expect(JSON.stringify(result)).not.toContain("Private fixture location");
    expect(result).not.toHaveProperty("rules");
    await expect(
      previewCommerce({
        items: [{ variantId: randomUUID(), quantity: 1 }],
        context: {},
      }),
    ).rejects.toThrow(/unavailable/i);
  });
  it("previews the same post-discount shipping qualification as checkout and rejects invalid promotions", async () => {
    const result = await previewCommerce({
      items: [{ variantId: variant, quantity: 2 }],
      context: { fulfillmentType: "shipping", country: "US", region: "CA" },
      promotionCode: "SAVE",
    });
    expect(result.evaluation.shipping).toMatchObject({
      freeThresholdCents: 2000,
      remainingCents: 500,
    });
    expect(result.evaluation.merchandiseSubtotalCents).toBe(1500);
    const invalid = await previewCommerce({
      items: [{ variantId: variant, quantity: 1 }],
      context: { fulfillmentType: "shipping", country: "US", region: "CA" },
      promotionCode: "DOESNOTEXIST",
    });
    expect(invalid.evaluation.promotion.eligible).toBe(false);
  });
  it("keeps promotion restrictions and revision fencing when a code is renamed or reused", async () => {
    const code = "CODE_" + randomUUID().slice(0, 8).toUpperCase();
    const renamed = code + "_NEW";
    const input = {
      staffUserId: owner,
      code,
      name: "Restricted promotion",
      discountType: "fixed" as const,
      discountValue: 100,
      minimumSubtotalCents: 0,
      isActive: true,
    };
    const promotion = await savePromotion(input);
    const restriction = rule("promotion", 0, {
      promotionCode: code,
      conditions: { fulfillmentMethods: ["pickup"] },
    });
    const disabled = {
      ...restriction,
      id: randomUUID(),
      priority: 20,
      enabled: false,
    };
    await save([restriction, disabled]);
    const [before] = await client`select quote_version from store_settings`;
    await savePromotion({ ...input, id: promotion!.id, code: renamed });
    const [after] =
      await client`select quote_version,commerce_rules from store_settings`;
    expect(after!.commerce_rules).toEqual([
      { ...restriction, promotionCode: renamed },
      { ...disabled, promotionCode: renamed },
    ]);
    expect(after!.quote_version).toBe(before!.quote_version + 1);
    await expect(
      saveCommerceRule({
        staffUserId: owner,
        expectedVersion: before!.quote_version,
        rule: restriction,
      }),
    ).rejects.toThrow(/changed|refresh/i);
    await expect(quote({ promotionCode: renamed })).rejects.toThrow(
      /promotion.*eligible/i,
    );
    expect(
      (
        await quote({
          promotionCode: renamed,
          fulfillmentType: "pickup",
          pickupLocationId: pickup,
          shippingAddress: { country: "", address: "" },
        })
      ).q.discountCents,
    ).toBe(100);
    await savePromotion({ ...input, name: "Reused code" });
    expect((await quote({ promotionCode: code })).q.discountCents).toBe(100);
  });
  it("validates local delivery destinations before estimating free delivery and matches checkout", async () => {
    await client`update store_settings set commerce_policy=commerce_policy || '{"deliveryEnabled":true}'::jsonb`;
    const [area] =
      await client`insert into delivery_areas(name,country_codes,postal_prefixes,rate_cents,free_threshold_cents) values('Preview fixture','["US"]'::jsonb,'["981"]'::jsonb,800,2000) returning id`;
    const threshold = rule("free_shipping", 1500, {
      conditions: { fulfillmentMethods: ["local_delivery"] },
    });
    try {
      await save([threshold]);
      const input = {
        items: [{ variantId: variant, quantity: 2 }],
        context: {
          fulfillmentType: "local_delivery" as const,
          country: "US",
          postalCode: "10001",
        },
      };
      await expect(previewCommerce(input)).rejects.toThrow(
        /delivery.*destination/i,
      );
      await expect(
        previewCommerce({
          ...input,
          context: { ...input.context, country: "CA", postalCode: "M5V1A1" },
        }),
      ).rejects.toThrow(/delivery.*destination/i);
      const missing = await previewCommerce({
        ...input,
        context: { fulfillmentType: "local_delivery", country: "US" },
      });
      expect(missing.evaluation.shipping).toMatchObject({
        pending: true,
        remainingCents: null,
      });
      const valid = {
        ...input,
        context: { ...input.context, postalCode: "98101" },
        promotionCode: "SAVE",
      };
      const preview = await previewCommerce(valid);
      expect(preview.evaluation.shipping).toMatchObject({
        pending: false,
        freeThresholdCents: 1500,
        remainingCents: 0,
      });
      expect(
        (
          await quote(
            {
              fulfillmentType: "local_delivery",
              deliveryAreaId: area!.id,
              shippingAddress: {
                country: "US",
                postalCode: "98101",
                address: "1 Fixture St",
              },
              promotionCode: "SAVE",
            },
            2,
          )
        ).q.shippingCents,
      ).toBe(0);
      await save([{ ...threshold, value: 1600 }]);
      expect((await previewCommerce(valid)).evaluation.shipping).toMatchObject({
        pending: false,
        freeThresholdCents: 1600,
        remainingCents: 100,
      });
      expect(
        (
          await quote(
            {
              fulfillmentType: "local_delivery",
              deliveryAreaId: area!.id,
              shippingAddress: {
                country: "US",
                postalCode: "98101",
                address: "1 Fixture St",
              },
              promotionCode: "SAVE",
            },
            2,
          )
        ).q.shippingCents,
      ).toBe(800);
    } finally {
      await client`delete from delivery_areas where id=${area!.id}`;
      await client`update store_settings set commerce_policy=commerce_policy || '{"deliveryEnabled":false}'::jsonb`;
    }
  });
  it("keeps delivery qualification pending when multiple delivery areas could apply", async () => {
    await client`update store_settings set commerce_policy=commerce_policy || '{"deliveryEnabled":true}'::jsonb`;
    const areas =
      await client`insert into delivery_areas(name,country_codes,postal_prefixes,rate_cents,free_threshold_cents) values('Ambiguous one','["US"]'::jsonb,'["981"]'::jsonb,800,1500),('Ambiguous two','["US"]'::jsonb,'["981"]'::jsonb,900,3000) returning id`;
    try {
      await save([
        rule("free_shipping", 1500, {
          conditions: { fulfillmentMethods: ["local_delivery"] },
        }),
      ]);
      const result = await previewCommerce({
        items: [{ variantId: variant, quantity: 2 }],
        context: {
          fulfillmentType: "local_delivery",
          country: "US",
          postalCode: "98101",
        },
      });
      expect(result.evaluation.shipping).toMatchObject({
        pending: true,
        remainingCents: null,
      });
    } finally {
      for (const area of areas)
        await client`delete from delivery_areas where id=${area.id}`;
      await client`update store_settings set commerce_policy=commerce_policy || '{"deliveryEnabled":false}'::jsonb`;
    }
  });
  it("archives variants referenced by commerce rules and retains exclusion targets through edits", async () => {
    const created = await createProduct({
      staffUserId: owner,
      title: "Removal fixture",
      handle: randomUUID(),
      variants: [
        { sku: randomUUID(), title: "Target", priceCents: 1000 },
        { sku: randomUUID(), title: "Other", priceCents: 1000 },
      ],
    });
    const target = created.variants[0]!.id;
    const restriction = rule("availability", 0, { variantIds: [target] });
    await save([restriction]);
    expect(
      await removeProductVariant({
        staffUserId: owner,
        productId: created.product.id,
        variantId: target,
        reason: "Remove option",
      }),
    ).toBe("archived");
    const [settings] = await client`select quote_version from store_settings`;
    await saveCommerceRule({
      staffUserId: owner,
      expectedVersion: settings!.quote_version,
      rule: { ...restriction, name: "Renamed exclusion" },
    });
    const [stored] = await client`select commerce_rules from store_settings`;
    expect(stored!.commerce_rules[0].variantIds).toEqual([target]);
    const result = await previewCommerce({
      items: [{ variantId: created.variants[1]!.id, quantity: 1 }],
      context: { fulfillmentType: "shipping", country: "US" },
    });
    expect(result.evaluation.items[0]!.available).toBe(true);
  });
  it.each(["shipping", "local_delivery"] as const)(
    "keeps %s qualification pending until promotion eligibility resolves",
    async (method) => {
      const code = "PENDING_" + randomUUID().slice(0, 8).toUpperCase();
      await savePromotion({
        staffUserId: owner,
        code,
        name: "Pending discount",
        discountType: "percentage",
        discountValue: 5000,
        minimumSubtotalCents: 0,
        isActive: true,
      });
      await save([
        rule("promotion", 0, {
          promotionCode: code,
          conditions: { countries: ["US"], regions: ["CA"] },
        }),
        rule("free_shipping", 15000),
      ]);
      await client`update store_settings set commerce_policy=commerce_policy || '{"deliveryEnabled":true}'::jsonb`;
      const [area] =
        await client`insert into delivery_areas(name,country_codes,postal_prefixes,rate_cents,free_threshold_cents) values('Pending fixture','["US"]'::jsonb,'["981"]'::jsonb,800,15000) returning id`;
      const input = {
        items: [{ variantId: variant, quantity: 20 }],
        context: {
          fulfillmentType: method,
          country: "US",
          postalCode: "98101",
        },
        promotionCode: code,
      };
      try {
        const pending = await previewCommerce(input);
        expect(pending.evaluation.promotion.pending).toBe(true);
        expect(pending.evaluation.shipping).toMatchObject({
          pending: true,
          remainingCents: null,
        });
        expect(pending.evaluation.merchandiseSubtotalCents).toBeNull();
        const eligible = await previewCommerce({
          ...input,
          context: { ...input.context, region: "CA" },
        });
        expect(eligible.evaluation.shipping).toMatchObject({
          pending: false,
          remainingCents: 5000,
        });
        expect(eligible.evaluation.merchandiseSubtotalCents).toBe(10000);
        const ineligible = await previewCommerce({
          ...input,
          context: { ...input.context, region: "WA" },
        });
        expect(ineligible.evaluation.promotion).toMatchObject({
          pending: false,
          eligible: false,
        });
        expect(ineligible.evaluation.shipping).toMatchObject({
          pending: false,
          remainingCents: 0,
        });
      } finally {
        await client`delete from delivery_areas where id=${area!.id}`;
        await client`update store_settings set commerce_policy=commerce_policy || '{"deliveryEnabled":false}'::jsonb`;
      }
    },
  );
  async function largeCart(count: number) {
    const ids: string[] = [];
    for (let group = 0; group < 2; group++) {
      const created = await createProduct({
        staffUserId: owner,
        title: "Cart limit fixture",
        handle: randomUUID(),
        variants: Array.from({ length: 50 }, () => ({
          sku: randomUUID(),
          title: randomUUID(),
          priceCents: 1000,
        })),
      });
      ids.push(...created.variants.map((item) => item.id));
    }
    ids.push(variant);
    const guestSessionId = randomUUID();
    const cart = await addToCart({
      guestSessionId,
      variantId: ids[0]!,
      quantity: 1,
    });
    await client`insert into cart_items(cart_id,variant_id,quantity) select ${cart.id},value::uuid,1 from jsonb_array_elements_text(${JSON.stringify(ids.slice(1, count))}::jsonb)`;
    return { cart, ids, guestSessionId };
  }
  it("enforces the preview line limit when concurrent additions compete and permits existing-line edits", async () => {
    const { cart, ids, guestSessionId } = await largeCart(99);
    const attempts = await Promise.allSettled(
      ids
        .slice(99)
        .map((variantId) =>
          addToCart({ guestSessionId, variantId, quantity: 1 }),
        ),
    );
    expect(
      attempts.filter((attempt) => attempt.status === "fulfilled"),
    ).toHaveLength(1);
    const rejected = attempts.find((attempt) => attempt.status === "rejected");
    expect(rejected?.status === "rejected" && rejected.reason.message).toMatch(
      /100 different items/i,
    );
    expect(
      (
        await client`select count(*)::int as count from cart_items where cart_id=${cart.id}`
      )[0]!.count,
    ).toBe(100);
    const edited = await addToCart({
      guestSessionId,
      variantId: ids[0]!,
      quantity: 1,
    });
    expect(
      edited.items.find((item) => item.variantId === ids[0])!.quantity,
    ).toBe(2);
    const request = {
      items: edited.items.map((item) => ({
        variantId: item.variantId,
        quantity: item.quantity,
      })),
      context: { fulfillmentType: "shipping" as const, country: "US" },
    };
    expect((await previewCommerce(request)).evaluation.items).toHaveLength(100);
    expect(
      (
        await getQuote({
          cartId: cart.id,
          guestSessionId,
          fulfillmentType: "shipping",
          shippingAddress: { country: "US", address: "1 Fixture St" },
          paymentAccountId: bank,
        })
      ).merchandiseSubtotalCents,
    ).toBe(101000);
  });
  it("explains the limit for legacy oversized carts and allows removal before checkout", async () => {
    const { cart, guestSessionId } = await largeCart(101);
    const input = {
      cartId: cart.id,
      guestSessionId,
      fulfillmentType: "shipping" as const,
      shippingAddress: { country: "US", address: "1 Fixture St" },
      paymentAccountId: bank,
    };
    await expect(getQuote(input)).rejects.toThrow(/100 different items/i);
    const [item] =
      await client`select id from cart_items where cart_id=${cart.id} limit 1`;
    const updated = await updateCartItem({
      guestSessionId,
      itemId: item!.id,
      quantity: 0,
    });
    expect(updated.items).toHaveLength(100);
    expect((await getQuote(input)).merchandiseSubtotalCents).toBe(100000);
  });
  function giveaway(code: string) {
    return {
      staffUserId: owner,
      code,
      name: "Bounded giveaway",
      discountType: "percentage" as const,
      discountValue: 10000,
      minimumSubtotalCents: 0,
      maximumOriginalSubtotalCents: 1000,
      maximumQuantity: 1,
      usageLimit: 1,
      endsAt: new Date(Date.now() + 86400000),
      isActive: true,
    };
  }
  it("requires value, quantity, expiry and redemption limits before a full-discount campaign can activate", async () => {
    const input = giveaway("GIFT_" + randomUUID().slice(0, 8).toUpperCase());
    for (const missing of [
      "maximumOriginalSubtotalCents",
      "maximumQuantity",
      "usageLimit",
      "endsAt",
    ] as const) {
      const incomplete = { ...input, [missing]: undefined };
      await expect(savePromotion(incomplete)).rejects.toThrow(
        /giveaway.*(limit|expiry)/i,
      );
    }
    const draft = await savePromotion({
      ...input,
      maximumOriginalSubtotalCents: undefined,
      maximumQuantity: undefined,
      usageLimit: undefined,
      endsAt: undefined,
      isActive: false,
    });
    await expect(
      setPromotionActive({ staffUserId: owner, id: draft!.id, isActive: true }),
    ).rejects.toThrow(/giveaway.*(limit|expiry)/i);
    await client`update promotions set is_active=true where id=${draft!.id}`;
    const preview = await previewCommerce({
      items: [{ variantId: variant, quantity: 1 }],
      context: { fulfillmentType: "pickup", pickupLocationId: pickup },
      promotionCode: input.code,
    });
    expect(preview.evaluation.promotion.eligible).toBe(false);
    await expect(
      quote({
        fulfillmentType: "pickup",
        pickupLocationId: pickup,
        shippingAddress: { country: "", address: "" },
        promotionCode: input.code,
      }),
    ).rejects.toThrow(/giveaway.*(limit|expiry)/i);
  });
  it("checks giveaway limits against base catalog value and total units before overrides or discounts", async () => {
    const input = giveaway("VALUE_" + randomUUID().slice(0, 8).toUpperCase());
    const promotion = await savePromotion({
      ...input,
      maximumOriginalSubtotalCents: 500,
    });
    await save([
      rule("price", 100, {
        variantIds: [variant],
        conditions: { fulfillmentMethods: ["pickup"] },
      }),
    ]);
    const request = {
      items: [{ variantId: variant, quantity: 1 }],
      context: { fulfillmentType: "pickup" as const, pickupLocationId: pickup },
      promotionCode: input.code,
    };
    expect((await previewCommerce(request)).evaluation.promotion.eligible).toBe(
      false,
    );
    await expect(
      quote({
        fulfillmentType: "pickup",
        pickupLocationId: pickup,
        shippingAddress: { country: "", address: "" },
        promotionCode: input.code,
      }),
    ).rejects.toThrow(/maximum.*(value|subtotal)/i);
    await savePromotion({
      ...input,
      id: promotion!.id,
      maximumOriginalSubtotalCents: 2000,
    });
    expect(
      (
        await previewCommerce({
          ...request,
          items: [{ variantId: variant, quantity: 2 }],
        })
      ).evaluation.promotion.eligible,
    ).toBe(false);
    await expect(
      quote(
        {
          fulfillmentType: "pickup",
          pickupLocationId: pickup,
          shippingAddress: { country: "", address: "" },
          promotionCode: input.code,
        },
        2,
      ),
    ).rejects.toThrow(/maximum.*quantity/i);
    const accepted = await quote({
      fulfillmentType: "pickup",
      pickupLocationId: pickup,
      shippingAddress: { country: "", address: "" },
      paymentAccountId: undefined,
      promotionCode: input.code,
    });
    expect(accepted.q.totalPayableCents).toBe(0);
    await savePromotion({
      ...input,
      id: promotion!.id,
      maximumOriginalSubtotalCents: 500,
    });
    await expect(place(accepted)).rejects.toThrow(/maximum.*(value|subtotal)/i);
    expect(
      (
        await client`select count(*)::int as count from promotion_redemptions where promotion_id=${promotion!.id}`
      )[0]!.count,
    ).toBe(0);
  });
  it("confirms bounded free orders without payment and serializes the final giveaway redemption", async () => {
    const input = giveaway("LAST_" + randomUUID().slice(0, 8).toUpperCase());
    await savePromotion(input);
    const details = {
      fulfillmentType: "pickup" as const,
      pickupLocationId: pickup,
      shippingAddress: { country: "", address: "" },
      paymentAccountId: undefined,
      promotionCode: input.code,
    };
    const one = await quote(details),
      two = await quote(details);
    const attempts = await Promise.allSettled([place(one), place(two)]);
    expect(
      attempts.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const confirmed = attempts.find((result) => result.status === "fulfilled");
    if (confirmed?.status === "fulfilled")
      expect(confirmed.value).toMatchObject({
        lifecycleStatus: "confirmed",
        purchaseTotalCents: 0,
        rewardSnapshot: null,
      });
  });
  it("edits individual rules with revision fencing, reference validation and owner authorization", async () => {
    const [before] = await client`select quote_version from store_settings`;
    const first = rule("price", 1200, { variantIds: [variant] });
    await saveCommerceRule({
      staffUserId: owner,
      expectedVersion: before!.quote_version,
      rule: first,
    });
    await expect(
      saveCommerceRule({
        staffUserId: owner,
        expectedVersion: before!.quote_version,
        rule: { ...first, value: 1300 },
      }),
    ).rejects.toThrow(/changed|refresh/i);
    const [current] = await client`select quote_version from store_settings`;
    await expect(
      saveCommerceRule({
        staffUserId: "evaluation-staff",
        expectedVersion: current!.quote_version,
        rule: first,
      }),
    ).rejects.toThrow();
    await expect(
      saveCommerceRule({
        staffUserId: owner,
        expectedVersion: current!.quote_version,
        rule: { ...first, variantIds: [randomUUID()] },
      }),
    ).rejects.toThrow(/variant/i);
    await deleteCommerceRule({
      staffUserId: owner,
      expectedVersion: current!.quote_version,
      id: first.id,
    });
    expect(
      (await client`select commerce_rules from store_settings`)[0]!
        .commerce_rules,
    ).toEqual([]);
  });
});
