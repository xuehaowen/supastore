import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { eq } from "drizzle-orm";
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
import { customerAccount } from "@/application/use-cases/customers/customer-ownership";
import { recordReceipt } from "@/application/use-cases/record-receipt";
import { confirmOrder } from "@/application/use-cases/confirm-order";
import { correctReceipt } from "@/application/use-cases/payments/correct-receipt";
import { refundPurchase } from "@/application/use-cases/store-credit/purchase-refund";
import { cancelOrder } from "@/application/use-cases/orders/cancel-order";
import { releaseOrderReward } from "@/application/use-cases/store-credit/reward-operations";
import { resolveRewardFundingReview } from "@/application/use-cases/store-credit/resolve-reward-review";
import { acquireTransactionLocks } from "@/domain/locking/lock-order";
import { commercePolicy } from "@/domain/commerce-policy";
const server = process.env.TRANSLATION_TEST_DATABASE_URL;
describe.skipIf(!server)(
  "reward activation categories and funding repair PostgreSQL",
  () => {
    const name = `reward_test_${randomUUID().replaceAll("-", "")}`,
      owner = "reward-owner";
    let admin: ReturnType<typeof postgres>,
      client: ReturnType<typeof postgres>,
      bank: string;
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
        migrationsFolder: "src/infrastructure/db/migrations",
      });
      await client`insert into staff_memberships(user_id,email,role) values(${owner},'owner@reward.test','owner'),('reward-staff','staff@reward.test','staff')`;
      await client`insert into store_settings(store_name,support_email,setup_completed,email_verified_at) values('Reward fixture','support@reward.test',true,now())`;
      const [account] =
        await client`insert into payment_accounts(account_name,account_identifier) values('Bank','Bank') returning id`;
      bank = account!.id;
      await client`insert into shipping_zones(name,rate_cents) values('Worldwide',0)`;
    }, 30000);
    afterEach(() => vi.useRealTimers());
    afterAll(async () => {
      if (client) await client.end();
      if (admin) {
        await admin.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
        await admin.end();
      }
    });
    async function setPolicy(
      input: Parameters<typeof commercePolicy>[0] = { rewardsEnabled: true },
    ) {
      const policy = commercePolicy(input);
      await client`update store_settings set commerce_policy=${JSON.stringify(policy)}::jsonb,quote_version=quote_version+1`;
    }
    async function user() {
      const id = randomUUID();
      await client`insert into "user"(id,name,email,email_verified) values(${id},'Reward customer',${`${id}@reward.test`},true)`;
      const customer = (await customerAccount(id)).customer;
      return { id, customerId: customer.id };
    }
    async function product(amount: number) {
      const id = randomUUID();
      return (
        await createProduct({
          staffUserId: owner,
          title: "Reward item",
          handle: id,
          variants: [{ sku: id, title: "Default", priceCents: amount }],
        })
      ).variants[0]!;
    }
    async function quote(variants: string[]) {
      const guestSessionId = randomUUID();
      let cartId = "";
      for (const variantId of variants)
        cartId = (await addToCart({ guestSessionId, variantId, quantity: 1 }))
          .id;
      const quoted = await getQuote({
        cartId,
        guestSessionId,
        fulfillmentType: "shipping",
        shippingAddress: { country: "US", address: "1 Fixture St" },
        paymentAccountId: bank,
      });
      return {
        quoteId: quoted.id,
        guestSessionId,
        guestEmail: "customer@reward.test",
        guestName: "Customer",
      };
    }
    async function accepted(
      userId: string,
      amount: number,
      creditAppliedCents = 0,
    ) {
      const variant = await product(amount);
      const order = await createOrder({
        ...(await quote([variant.id])),
        customerUserId: userId,
        creditAppliedCents,
      });
      let receiptId: string | null = null;
      if (amount > creditAppliedCents) {
        const receipt = await recordReceipt({
          orderId: order.id,
          paymentAccountId: bank,
          amountCents: amount - creditAppliedCents,
          rawReference: randomUUID(),
          staffUserId: owner,
        });
        receiptId = receipt.receiptId;
        await confirmOrder({ orderId: order.id, staffUserId: owner });
      }
      return { orderId: order.id, receiptId };
    }
    async function completed(orderId: string) {
      const database = active.db as typeof import("@/infrastructure/db").db;
      await database.transaction(async (tx) => {
        await acquireTransactionLocks(tx, { orderIds: [orderId] });
        await tx
          .update(schema.orders)
          .set({ lifecycleStatus: "completed" })
          .where(eq(schema.orders.id, orderId));
        await releaseOrderReward(tx, orderId, owner);
      });
    }
    async function account(customerId: string) {
      return (
        await client`select * from store_credit_accounts where customer_id=${customerId}`
      )[0]!;
    }
    it("freezes selected categories and activation dates in accepted orders", async () => {
      const customer = await user(),
        eligible = await product(1000),
        other = await product(1000);
      const [category] =
        await client`insert into categories(name,slug) values('Rewards',${randomUUID()}) returning id`;
      await client`insert into product_categories(product_id,category_id) values(${eligible.productId},${category!.id})`;
      await setPolicy({
        rewardsEnabled: true,
        rewardEligibleCategoryIds: [category!.id],
        rewardsStartAt: "2000-01-01T00:00:00Z",
        rewardsEndAt: "2100-01-01T00:00:00Z",
      });
      const order = await createOrder({
        ...(await quote([eligible.id, other.id])),
        customerUserId: customer.id,
      });
      expect(order.rewardSnapshot).toMatchObject({
        basis: 1000,
        entitlement: 50,
      });
      await recordReceipt({
        orderId: order.id,
        paymentAccountId: bank,
        amountCents: 2000,
        rawReference: randomUUID(),
        staffUserId: owner,
      });
      await confirmOrder({ orderId: order.id, staffUserId: owner });
      await setPolicy({ rewardsEnabled: false, rewardRateBasisPoints: 1000 });
      await completed(order.id);
      expect((await account(customer.customerId)).balance_cents).toBe(50);
    });
    it("requires quote acceptance again when activation begins before placement", async () => {
      const customer = await user(),
        variant = await product(1000);
      await setPolicy({
        rewardsEnabled: true,
        rewardsStartAt: "2030-01-01T00:01:00Z",
      });
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2030-01-01T00:00:00Z"));
      const previous = await quote([variant.id]);
      vi.setSystemTime(new Date("2030-01-01T00:01:00Z"));
      await expect(
        createOrder({ ...previous, customerUserId: customer.id }),
      ).rejects.toThrow("changed");
      const current = await quote([variant.id]);
      expect(
        (await createOrder({ ...current, customerUserId: customer.id }))
          .rewardSnapshot?.entitlement,
      ).toBe(50);
    });
    it("rejects unresolved funding, restores supported reward once, and reconciles later refunds", async () => {
      await setPolicy();
      const customer = await user(),
        order = await accepted(customer.id, 2000);
      await completed(order.orderId);
      expect((await account(customer.customerId)).balance_cents).toBe(100);
      await correctReceipt({
        receiptId: order.receiptId!,
        deltaAmountCents: -1000,
        reason: "Wrong amount",
        ownerUserId: owner,
      });
      const review = {
        orderId: order.orderId,
        actorId: owner,
        requestKey: randomUUID(),
        reason: "Verified original bank receipt and corrected amount",
      };
      await expect(resolveRewardFundingReview(review)).rejects.toThrow(
        "shortfall",
      );
      await expect(
        resolveRewardFundingReview({ ...review, actorId: "reward-staff" }),
      ).rejects.toThrow();
      await correctReceipt({
        receiptId: order.receiptId!,
        deltaAmountCents: 1000,
        reason: "Original statement confirms full receipt",
        ownerUserId: owner,
      });
      const results = await Promise.all([
        resolveRewardFundingReview(review),
        resolveRewardFundingReview(review),
      ]);
      expect(results[0]).toBe(results[1]);
      await expect(
        resolveRewardFundingReview({ ...review, reason: "Different evidence" }),
      ).rejects.toThrow("different input");
      expect((await account(customer.customerId)).balance_cents).toBe(100);
      expect(
        (
          await client`select reward_funding_review from orders where id=${order.orderId}`
        )[0]!.reward_funding_review,
      ).toBe(false);
      await expect(
        client`delete from reward_funding_reviews where id=${results[0]!}`,
      ).rejects.toMatchObject({ code: "23514" });
      await refundPurchase({
        orderId: order.orderId,
        ownerUserId: owner,
        amountCents: 500,
        reason: "Partial refund after repaired funding",
        requestKey: randomUUID(),
      });
      expect((await account(customer.customerId)).balance_cents).toBe(75);
      expect(
        await client`select d.id from event_deliveries d join outbox_events e on e.id=d.event_id where e.aggregate_id=${order.orderId} and e.event_type like 'reward.%'`,
      ).toHaveLength(0);
    });
    it("cancels associated debt without breaking a revoked active hold", async () => {
      await setPolicy();
      const customer = await user(),
        source = await accepted(customer.id, 2000);
      await completed(source.orderId);
      const variant = await product(1000);
      const held = await createOrder({
        ...(await quote([variant.id])),
        customerUserId: customer.id,
        creditAppliedCents: 100,
      });
      await correctReceipt({
        receiptId: source.receiptId!,
        deltaAmountCents: -1000,
        reason: "Funding loss",
        ownerUserId: owner,
      });
      await correctReceipt({
        receiptId: source.receiptId!,
        deltaAmountCents: 1000,
        reason: "Original funding verified",
        ownerUserId: owner,
      });
      await resolveRewardFundingReview({
        orderId: source.orderId,
        actorId: owner,
        requestKey: randomUUID(),
        reason: "Verified source repair with hold intact",
      });
      expect(await account(customer.customerId)).toMatchObject({
        balance_cents: 100,
        reserved_cents: 100,
      });
      const [lot] =
        await client`select debt_cents,revoked_pending_cents from credit_source_lots where reward_order_id=${source.orderId}`;
      expect(lot).toMatchObject({ debt_cents: 0, revoked_pending_cents: 0 });
      await cancelOrder({
        orderId: held.id,
        actorUserId: owner,
        reason: "Customer cancels held order",
      });
      expect(await account(customer.customerId)).toMatchObject({
        balance_cents: 100,
        reserved_cents: 0,
      });
    });
    it("compensates later debt recovery once when spent rewards are reinstated", async () => {
      await setPolicy();
      const customer = await user(),
        source = await accepted(customer.id, 2000);
      await completed(source.orderId);
      const spent = await accepted(customer.id, 100, 100);
      await correctReceipt({
        receiptId: source.receiptId!,
        deltaAmountCents: -1000,
        reason: "Funding loss",
        ownerUserId: owner,
      });
      const later = await accepted(customer.id, 1000);
      await completed(later.orderId); // Fifty units repay debt, rather than being issued.
      expect((await account(customer.customerId)).balance_cents).toBe(0);
      await correctReceipt({
        receiptId: source.receiptId!,
        deltaAmountCents: 1000,
        reason: "Original funding restored",
        ownerUserId: owner,
      });
      await resolveRewardFundingReview({
        orderId: source.orderId,
        actorId: owner,
        requestKey: randomUUID(),
        reason: "Original statement verified",
      });
      expect((await account(customer.customerId)).balance_cents).toBe(50);
      await refundPurchase({
        orderId: spent.orderId,
        ownerUserId: owner,
        amountCents: 100,
        reason: "Restore consumed source",
        requestKey: randomUUID(),
      });
      expect((await account(customer.customerId)).balance_cents).toBe(150);
      const [reconciled] =
        await client`select a.balance_cents,(select sum(amount_cents) from store_credit_entries e where e.account_id=a.id) AS ledger,(select sum(remaining_cents) from credit_source_lots l where l.account_id=a.id) AS lots from store_credit_accounts a where a.customer_id=${customer.customerId}`;
      expect(Number(reconciled!.ledger)).toBe(reconciled!.balance_cents);
      expect(Number(reconciled!.lots)).toBe(reconciled!.balance_cents);
    });
  },
);
