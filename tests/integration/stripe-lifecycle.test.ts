import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
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
import { hashToken } from "@/application/common/guest-access";
import {
  startStripeCheckout,
  acceptStripeEvent,
} from "@/application/use-cases/payments/stripe-checkout";
import { sendStripeRefund } from "@/application/use-cases/payments/stripe-refund";
import { authorizeRefund } from "@/application/use-cases/refund-payout";
import { createProduct } from "@/application/use-cases/catalog/create-product";
import { addToCart } from "@/application/use-cases/cart/add-to-cart";
import { getQuote } from "@/application/use-cases/get-quote";
import { createOrder } from "@/application/use-cases/create-order";
import { getLaunchReadiness } from "@/application/use-cases/store/get-launch-readiness";
import { GET as publicStore } from "@/app/api/v1/store/route";
import {
  StripeAdapter,
  type StripeSession,
} from "@/infrastructure/payments/stripe";
const server = process.env.TRANSLATION_TEST_DATABASE_URL;
describe.skipIf(!server)("Stripe durable payment lifecycle", () => {
  const name = `stripe_test_${randomUUID().replaceAll("-", "")}`;
  const owner = randomUUID();
  let admin: ReturnType<typeof postgres>, client: ReturnType<typeof postgres>;
  beforeAll(async () => {
    vi.stubEnv("STOREFRONT_ORIGIN", "https://shop.example");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fixture");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_fixture");
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
    await client`insert into staff_memberships(user_id,email,role) values(${owner},${owner + "@example.test"},'owner')`;
    await client`insert into store_settings(store_name,support_email,setup_completed,email_verified_at) values('Stripe tests','support@example.test',true,now())`;
    await client`insert into shipping_zones(name,rate_cents) values('Worldwide',0)`;
  }, 30000);
  afterAll(async () => {
    vi.unstubAllEnvs();
    if (client) await client.end();
    if (admin) {
      await admin.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await admin.end();
    }
  });
  async function fixture() {
    const [cart] =
      await client`insert into carts(guest_session_id) values(${randomUUID()}) returning id`;
    const [quote] =
      await client`insert into quotes(cart_id,cart_revision,merchandise_subtotal_cents,shipping_cents,exclusive_tax_cents,inclusive_tax_cents,total_payable_cents,items_snapshot,shipping_snapshot,expires_at) values(${cart!.id},1,1000,0,0,0,1000,'[]','{}',now()+interval '15 minutes') returning id`;
    const [order] =
      await client`insert into orders(source_cart_id,quote_id,reference_code,purchase_total_cents,guest_email,guest_name,shipping_address_snapshot,terms_snapshot) values(${cart!.id},${quote!.id},${randomUUID()},1000,'test@example.test','Buyer','{}','{"currency":"USD","precision":2}') returning id`;
    const token = randomUUID();
    await client`insert into guest_order_sessions(order_id,token_hash,expires_at) values(${order!.id},${hashToken(token)},now()+interval '1 day')`;
    const session: StripeSession = {
      id: "cs_test_" + randomUUID().replaceAll("-", ""),
      url: "https://checkout.stripe.com/c/pay/fixture",
      status: "open",
      payment_status: "unpaid",
      payment_intent: "pi_" + randomUUID().replaceAll("-", ""),
      amount_total: 1000,
      currency: "usd",
      metadata: { orderId: order!.id },
    };
    const network = vi.fn(
      async (_url: string | URL | Request, options?: RequestInit) => {
        // The provider call must see the committed intent and acquire the order mutex immediately.
        // Creation has no competing request. Parallel webhook retrieval may
        // legitimately overlap another delivery's brief settlement transaction.
        if (!String(_url).includes("refunds") && options?.method === "POST")
          await client.begin(async (tx) => {
            await tx`select id from orders where id=${order!.id} for update nowait`;
          });
        const intents =
          await client`select id from stripe_checkout_attempts where order_id=${order!.id}`;
        expect(intents).toHaveLength(1);
        if (String(_url).includes("refunds")) {
          const params = new URLSearchParams(String(options?.body ?? ""));
          return Response.json({
            id: "re_" + session.payment_intent,
            amount: Number(params.get("amount") || 200),
            payment_intent: session.payment_intent,
            currency: "usd",
            status: "succeeded",
          });
        }
        return Response.json(session);
      },
    );
    const adapter = new StripeAdapter(
      "sk_test_fixture",
      "https://shop.example",
      network,
    );
    return { id: order!.id as string, token, session, adapter, network };
  }
  it("rejects another order's proof before creating a payment intent", async () => {
    const f = await fixture();
    await expect(
      startStripeCheckout({ orderId: f.id, sessionToken: "wrong" }, f.adapter),
    ).rejects.toThrow("recover");
    expect(
      await client`select id from stripe_checkout_attempts where order_id=${f.id}`,
    ).toHaveLength(0);
    expect(f.network).not.toHaveBeenCalled();
  });
  it("rejects replacement providers before checkout, inbox or refund side effects", async () => {
    const f = await fixture();
    const replacement = new Proxy(f.adapter, {
      get(target, property, receiver) {
        if (property === "provider") return "replacement-provider";
        return Reflect.get(target, property, receiver);
      },
    });
    await expect(
      startStripeCheckout(
        { orderId: f.id, sessionToken: f.token },
        replacement,
      ),
    ).rejects.toThrow("original Stripe provider");
    await expect(
      sendStripeRefund(
        { allocationId: randomUUID(), ownerUserId: owner },
        replacement,
      ),
    ).rejects.toThrow("original Stripe provider");
    const eventId = `evt_${randomUUID().replaceAll("-", "")}`;
    await expect(
      acceptStripeEvent(
        {
          id: eventId,
          type: "checkout.session.completed",
          livemode: false,
          data: { object: {} },
        },
        replacement,
      ),
    ).rejects.toThrow("original Stripe provider");
    expect(f.network).not.toHaveBeenCalled();
    expect(
      await client`select id from stripe_checkout_attempts where order_id=${f.id}`,
    ).toHaveLength(0);
    expect(
      await client`select event_id from stripe_webhook_inbox where event_id=${eventId}`,
    ).toHaveLength(0);
  });
  it("rejects mismatched new and existing card intents before network activity", async () => {
    for (const [currency, precision] of [
      ["USD", 0],
      ["JPY", 2],
      ["XYZ", 2],
    ] as const) {
      const f = await fixture();
      await client`update orders set terms_snapshot=${JSON.stringify({ currency, precision })}::jsonb where id=${f.id}`;
      await expect(
        startStripeCheckout(
          { orderId: f.id, sessionToken: f.token },
          f.adapter,
        ),
      ).rejects.toThrow(/precision|verified/);
      expect(
        await client`select id from stripe_checkout_attempts where order_id=${f.id}`,
      ).toHaveLength(0);
      expect(f.network).not.toHaveBeenCalled();
    }
    const f = await fixture();
    await startStripeCheckout(
      { orderId: f.id, sessionToken: f.token },
      f.adapter,
    );
    await client`update orders set terms_snapshot='{"currency":"USD","precision":0}' where id=${f.id}`;
    await expect(
      startStripeCheckout({ orderId: f.id, sessionToken: f.token }, f.adapter),
    ).rejects.toThrow("precision");
    expect(f.network).toHaveBeenCalledTimes(1);
  });
  it("settles compatible JPY units unchanged and retains incompatible captured payments for review", async () => {
    const valid = await fixture();
    await client`update orders set terms_snapshot='{"currency":"JPY","precision":0}' where id=${valid.id}`;
    valid.session.currency = "jpy";
    await startStripeCheckout(
      { orderId: valid.id, sessionToken: valid.token },
      valid.adapter,
    );
    valid.session.status = "complete";
    valid.session.payment_status = "paid";
    await acceptStripeEvent(
      {
        id: `evt_${randomUUID().replaceAll("-", "")}`,
        type: "checkout.session.completed",
        livemode: false,
        data: { object: { id: valid.session.id } },
      },
      valid.adapter,
    );
    expect(
      (
        await client`select amount_cents from payment_receipts where order_id=${valid.id}`
      )[0]!.amount_cents,
    ).toBe(1000);
    const invalid = await fixture();
    await startStripeCheckout(
      { orderId: invalid.id, sessionToken: invalid.token },
      invalid.adapter,
    );
    await client`update orders set terms_snapshot='{"currency":"USD","precision":0}' where id=${invalid.id}`;
    invalid.session.status = "complete";
    invalid.session.payment_status = "paid";
    expect(
      (
        await acceptStripeEvent(
          {
            id: `evt_${randomUUID().replaceAll("-", "")}`,
            type: "checkout.session.completed",
            livemode: false,
            data: { object: { id: invalid.session.id } },
          },
          invalid.adapter,
        )
      ).status,
    ).toBe("review");
    expect(
      await client`select id from payment_receipts where order_id=${invalid.id}`,
    ).toHaveLength(0);
  });
  it("blocks incompatible original-payment refunds before claiming a payout", async () => {
    const f = await fixture();
    await startStripeCheckout(
      { orderId: f.id, sessionToken: f.token },
      f.adapter,
    );
    f.session.status = "complete";
    f.session.payment_status = "paid";
    await acceptStripeEvent(
      {
        id: `evt_${randomUUID().replaceAll("-", "")}`,
        type: "checkout.session.completed",
        livemode: false,
        data: { object: { id: f.session.id } },
      },
      f.adapter,
    );
    const [receipt] =
      await client`select id from payment_receipts where order_id=${f.id}`;
    const refund = await authorizeRefund({
      ownerUserId: owner,
      orderId: f.id,
      receiptId: receipt!.id,
      amountCents: 200,
      reason: "Unit regression",
    });
    const [allocation] =
      await client`select id from payout_allocations where refund_authorization_id=${refund.authorizationId}`;
    await client`update orders set terms_snapshot='{"currency":"USD","precision":0}' where id=${f.id}`;
    const calls = f.network.mock.calls.length;
    await expect(
      sendStripeRefund(
        { allocationId: allocation!.id, ownerUserId: owner },
        f.adapter,
      ),
    ).rejects.toThrow("precision");
    expect(
      await client`select id from payout_attempts where allocation_id=${allocation!.id}`,
    ).toHaveLength(0);
    expect(
      await client`select id from stripe_refund_intents where allocation_id=${allocation!.id}`,
    ).toHaveLength(0);
    expect(f.network).toHaveBeenCalledTimes(calls);
    await client`update orders set terms_snapshot='{"currency":"USD","precision":2}' where id=${f.id}`;
    f.network.mockImplementationOnce(async () =>
      Response.json({
        id: `re_${f.session.payment_intent}`,
        amount: 200,
        currency: "usd",
        payment_intent: f.session.payment_intent,
        status: "pending",
      }),
    );
    await sendStripeRefund(
      { allocationId: allocation!.id, ownerUserId: owner },
      f.adapter,
    );
    await client`update orders set terms_snapshot='{"currency":"USD","precision":0}' where id=${f.id}`;
    const retryCalls = f.network.mock.calls.length;
    await expect(
      sendStripeRefund(
        { allocationId: allocation!.id, ownerUserId: owner },
        f.adapter,
      ),
    ).rejects.toThrow("precision");
    expect(f.network).toHaveBeenCalledTimes(retryCalls);
    expect(
      await client`select id from payout_attempts where allocation_id=${allocation!.id}`,
    ).toHaveLength(1);
  });
  it("disables incompatible card-only quote/readiness and never exposes the provider account as manual payment", async () => {
    const product = await createProduct({
      staffUserId: owner,
      title: "Units fixture",
      handle: `units-${randomUUID()}`,
      variants: [{ sku: randomUUID(), title: "Default", priceCents: 1000 }],
    });
    const guestSessionId = randomUUID();
    const cart = await addToCart({
      guestSessionId,
      variantId: product.variants[0]!.id,
      quantity: 1,
    });
    await client`update store_settings set precision=0`;
    try {
      const quote = await getQuote({
        guestSessionId,
        cartId: cart.id,
        fulfillmentType: "shipping",
        shippingAddress: { country: "US", address: "1 Fixture St" },
      });
      expect(
        (quote.termsSnapshot as { onlinePayment?: boolean }).onlinePayment,
      ).toBe(false);
      expect(
        (await getLaunchReadiness()).checklist.find(
          (item) => item.key === "payment",
        )!.isReady,
      ).toBe(false);
      const response = await publicStore();
      const store = (await response.json()).data;
      expect(store.stripeConfigured).toBe(false);
      expect(
        store.paymentMethods.some(
          (method: { type: string }) => method.type === "stripe",
        ),
      ).toBe(false);
      const [provider] =
        await client`select id from payment_accounts where account_type='stripe' limit 1`;
      await expect(
        getQuote({
          guestSessionId,
          cartId: cart.id,
          fulfillmentType: "shipping",
          shippingAddress: { country: "US", address: "1 Fixture St" },
          paymentAccountId: provider!.id,
        }),
      ).rejects.toThrow("active payment");
    } finally {
      await client`update store_settings set precision=2`;
    }
  });
  it("creates a generic card-only purchase through cart and quote without a manual account", async () => {
    const code = randomUUID();
    const product = await createProduct({
      staffUserId: owner,
      title: "Generic card-only product",
      handle: `card-only-${code}`,
      variants: [{ sku: code, title: "Default", priceCents: 1000 }],
    });
    const guestSessionId = randomUUID();
    const cart = await addToCart({
      guestSessionId,
      variantId: product.variants[0]!.id,
      quantity: 1,
    });
    const quote = await getQuote({
      guestSessionId,
      cartId: cart.id,
      fulfillmentType: "shipping",
      shippingAddress: { country: "US", address: "1 Fixture St" },
    });
    expect(
      (quote.termsSnapshot as { onlinePayment?: boolean }).onlinePayment,
    ).toBe(true);
    const order = await createOrder({
      quoteId: quote.id,
      guestSessionId,
      guestEmail: "card-only@example.test",
      guestName: "Card-only Buyer",
    });
    expect(order.purchaseTotalCents).toBe(1000);
    expect(order.lifecycleStatus).toBe("unpaid");
    expect(order.sessionToken).toBeTruthy();
  });
  it("serializes parallel payment delivery into one receipt and confirmation", async () => {
    const f = await fixture();
    await startStripeCheckout(
      { orderId: f.id, sessionToken: f.token },
      f.adapter,
    );
    await startStripeCheckout(
      { orderId: f.id, sessionToken: f.token },
      f.adapter,
    );
    expect(f.network).toHaveBeenCalledTimes(1);
    f.session.status = "complete";
    f.session.payment_status = "paid";
    const event = {
      id: "evt_" + randomUUID().replaceAll("-", ""),
      type: "checkout.session.completed",
      livemode: false,
      data: { object: { id: f.session.id } },
    };
    await Promise.all([
      acceptStripeEvent(event, f.adapter),
      acceptStripeEvent(event, f.adapter),
    ]);
    expect(
      await client`select id from payment_receipts where order_id=${f.id}`,
    ).toHaveLength(1);
    expect(
      (await client`select lifecycle_status from orders where id=${f.id}`)[0]!
        .lifecycle_status,
    ).toBe("confirmed");
    const [receipt] =
      await client`select id from payment_receipts where order_id=${f.id}`;
    const refund = await authorizeRefund({
      ownerUserId: owner,
      orderId: f.id,
      receiptId: receipt!.id,
      amountCents: 200,
      reason: "Test refund",
    });
    const [allocation] =
      await client`select id from payout_allocations where refund_authorization_id=${refund.authorizationId}`;
    await Promise.all([
      sendStripeRefund(
        { allocationId: allocation!.id, ownerUserId: owner },
        f.adapter,
      ),
      sendStripeRefund(
        { allocationId: allocation!.id, ownerUserId: owner },
        f.adapter,
      ),
    ]);
    expect(
      await client`select id from outgoing_transfers where payout_attempt_id in (select payout_attempt_id from stripe_refund_intents where allocation_id=${allocation!.id})`,
    ).toHaveLength(1);
    expect(
      (
        await client`select settled_amount_cents from payout_allocations where id=${allocation!.id}`
      )[0]!.settled_amount_cents,
    ).toBe(200);
  });
  it("retains changed-order payments for review without confirming or losing the event", async () => {
    const f = await fixture();
    await startStripeCheckout(
      { orderId: f.id, sessionToken: f.token },
      f.adapter,
    );
    await client`update orders set financial_revision=financial_revision+1 where id=${f.id}`;
    f.session.status = "complete";
    f.session.payment_status = "paid";
    const event = {
      id: "evt_" + randomUUID().replaceAll("-", ""),
      type: "checkout.session.completed",
      livemode: false,
      data: { object: { id: f.session.id } },
    };
    expect((await acceptStripeEvent(event, f.adapter)).status).toBe("review");
    expect(
      (
        await client`select status from stripe_webhook_inbox where event_id=${event.id}`
      )[0]!.status,
    ).toBe("review");
    expect(
      (await client`select lifecycle_status from orders where id=${f.id}`)[0]!
        .lifecycle_status,
    ).toBe("unpaid");
  });
  it("preserves unsigned/mode-mismatched events outside the trusted settlement path", async () => {
    const f = await fixture();
    await expect(
      acceptStripeEvent(
        {
          id: "evt_test",
          type: "checkout.session.completed",
          livemode: true,
          data: { object: { id: f.session.id } },
        },
        f.adapter,
      ),
    ).rejects.toThrow("mode");
    expect(
      await client`select event_id from stripe_webhook_inbox where event_id='evt_test'`,
    ).toHaveLength(0);
  });
  it("releases definitive expired card-only holds while retaining manual payment holds", async () => {
    for (const onlinePayment of [true, false]) {
      const f = await fixture();
      await client`update orders set terms_snapshot=${JSON.stringify({ currency: "USD", precision: 2, onlinePayment })}::jsonb where id=${f.id}`;
      const product = await createProduct({
        staffUserId: owner,
        title: "Expiry fixture",
        handle: `expiry-${randomUUID()}`,
        variants: [{ sku: randomUUID(), title: "Default", priceCents: 1000 }],
      });
      const variantId = product.variants[0]!.id;
      await client`insert into variant_stock(variant_id,tracking_enabled,on_hand,reserved) values(${variantId},true,2,1)`;
      const [item] =
        await client`insert into order_items(order_id,variant_id,quantity,unit_price_cents,line_total_cents) values(${f.id},${variantId},1,1000,1000) returning id`;
      await client`insert into stock_reservations(order_id,order_item_id,variant_id,quantity) values(${f.id},${item!.id},${variantId},1)`;
      await startStripeCheckout(
        { orderId: f.id, sessionToken: f.token },
        f.adapter,
      );
      f.session.status = "expired";
      const event = {
        id: `evt_${randomUUID().replaceAll("-", "")}`,
        type: "checkout.session.expired",
        livemode: false,
        data: { object: { id: f.session.id } },
      };
      await acceptStripeEvent(event, f.adapter);
      expect(
        (await client`select lifecycle_status from orders where id=${f.id}`)[0]!
          .lifecycle_status,
      ).toBe(onlinePayment ? "cancelled" : "unpaid");
      expect(
        (
          await client`select status from stock_reservations where order_id=${f.id}`
        )[0]!.status,
      ).toBe(onlinePayment ? "released" : "active");
      expect(
        (
          await client`select reserved from variant_stock where variant_id=${variantId}`
        )[0]!.reserved,
      ).toBe(onlinePayment ? 0 : 1);
    }
  });
});
