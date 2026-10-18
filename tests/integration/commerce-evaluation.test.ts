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
});
