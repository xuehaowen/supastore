import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, expect, it } from "vitest";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db, queryClient as sql } from "@/infrastructure/db";
import {
  getAdminOperations,
  type AdminOperationsInput,
} from "@/application/queries/admin-operations";
import { requestTrackingLink } from "@/application/use-cases/guest/request-tracking-link";
import { streamOrderExportRows } from "@/application/use-cases/catalog/export-csv";

const owner = randomUUID(),
  cart = randomUUID(),
  quote = randomUUID(),
  account = randomUUID();
let order: { id: string; reference_code: string };
let payment: { id: string; reference_code: string };
const rawReference = `Bank-${randomUUID()}`;

beforeAll(async () => {
  if (!process.env.DATABASE_URL?.endsWith("/supastore_test"))
    throw new Error("Requires isolated integration database");
  await migrate(db, {
    migrationsFolder: "apps/backend/src/infrastructure/db/migrations",
  });
  await sql`insert into staff_memberships(user_id,email,role) values(${owner},${owner + "@example.test"},'owner')`;
  await sql`insert into carts(id,guest_session_id) values(${cart},${cart})`;
  await sql`insert into quotes(id,cart_id,cart_revision,merchandise_subtotal_cents,shipping_cents,exclusive_tax_cents,inclusive_tax_cents,total_payable_cents,items_snapshot,shipping_snapshot,expires_at)
    values(${quote},${cart},1,100,0,0,0,100,'[]','{}',now()+interval '15 minutes')`;
  [order] = await sql<
    [typeof order]
  >`insert into orders(source_cart_id,quote_id,purchase_total_cents,guest_name,guest_email,shipping_address_snapshot)
    values(${cart},${quote},100,'Buyer',${owner + "@example.test"},'{}') returning id,reference_code`;
  await sql`insert into payment_accounts(id,account_identifier,account_name) values(${account},${account},'Test account')`;
  [payment] = await sql<
    [typeof payment]
  >`insert into payment_receipts(order_id,payment_account_id,amount_cents,raw_reference,normalized_reference,recorded_by_user_id)
    values(${order.id},${account},100,${rawReference},${rawReference.toUpperCase()},${owner}) returning id,reference_code`;
});

afterAll(async () => {
  if (order) {
    await sql`delete from event_deliveries where event_id in (select id from outbox_events where aggregate_id=${order.id})`;
    await sql`delete from outbox_events where aggregate_id=${order.id}`;
    await sql`delete from guest_order_sessions where order_id=${order.id}`;
    await sql`delete from payment_receipts where order_id=${order.id}`;
    await sql`delete from orders where id=${order.id}`;
  }
  await sql`delete from payment_accounts where id=${account}`;
  await sql`delete from quotes where id=${quote}`;
  await sql`delete from carts where id=${cart}`;
  await sql`delete from staff_memberships where user_id=${owner}`;
  await sql.end();
});

function operations(overrides: Partial<AdminOperationsInput>) {
  return getAdminOperations({
    staffUserId: owner,
    view: "orders",
    search: "",
    status: "",
    page: 1,
    paymentSearch: "",
    paymentStatus: "",
    paymentType: "",
    paymentPage: 1,
    payoutPage: 1,
    evidencePage: 1,
    failurePage: 1,
    ...overrides,
  });
}

it("finds orders by their display number and exports it", async () => {
  for (const search of [
    order.reference_code,
    ` ${order.reference_code.replace("-", "").toLowerCase()} `,
  ]) {
    const data = await operations({ search });
    expect(data.rows.map((row) => row.id)).toContain(order.id);
    const rows = [];
    for await (const row of streamOrderExportRows({ search })) rows.push(row);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveProperty("reference_code", order.reference_code);
    expect(rows[0]).toHaveProperty("payment_numbers", payment.reference_code);
    expect(rows[0]).toHaveProperty("receipt_references", rawReference);
  }
});

it("finds payments by their own number, order number, and the original bank reference", async () => {
  for (const paymentSearch of [
    payment.reference_code,
    order.reference_code,
    rawReference,
    ` ${payment.reference_code.replace("-", "").toLowerCase()} `,
    ` ${order.reference_code.replace("-", " ").toLowerCase()} `,
  ]) {
    const data = await operations({ view: "payments", paymentSearch });
    expect(data.paymentRows.map((row) => row.receipt.id)).toContain(payment.id);
    expect(
      data.paymentRows.find((row) => row.receipt.id === payment.id)?.receipt
        .rawReference,
    ).toBe(rawReference);
  }
});

it("recovers with formatted or pasted order numbers and still requires the matching email", async () => {
  for (const referenceCode of [
    ` ${order.reference_code.replace("-", "").toLowerCase()} `,
    order.reference_code,
  ]) {
    await requestTrackingLink({
      email: owner + "@example.test",
      referenceCode,
    });
  }
  expect(
    (
      await sql`select count(*)::int as n from guest_order_sessions where order_id=${order.id}`
    )[0]!.n,
  ).toBe(2);
  await requestTrackingLink({
    email: "wrong@example.test",
    referenceCode: order.reference_code,
  });
  expect(
    (
      await sql`select count(*)::int as n from guest_order_sessions where order_id=${order.id}`
    )[0]!.n,
  ).toBe(2);
});

it("shows order payment status independently of lifecycle status and includes receipt corrections", async () => {
  const paid = await operations({
    view: "payments",
    paymentSearch: payment.reference_code,
  });
  expect(paid.paymentRows[0]?.order.lifecycleStatus).toBe("unpaid");
  expect(paid.paymentRows[0]?.paymentState).toBe("paid");
  const [correction] =
    await sql`insert into payment_receipt_corrections(receipt_id,delta_amount_cents,reason,corrected_by_user_id)
    values(${payment.id},-60,'Correct actual received amount',${owner}) returning id`;
  try {
    const partial = await operations({
      view: "payments",
      paymentSearch: payment.reference_code,
    });
    expect(partial.paymentRows[0]?.paymentState).toBe("partially_paid");
  } finally {
    await sql`delete from payment_receipt_corrections where id=${correction!.id}`;
  }
});

it("only labels settled purchase refunds as refunded and keeps excess returns separate", async () => {
  const [refund] =
    await sql`insert into refund_authorizations(order_id,kind,amount_cents,reason,authorized_by_user_id)
    values(${order.id},'purchase_refund',100,'Test refund',${owner}) returning id`;
  const [allocation] =
    await sql`insert into payout_allocations(refund_authorization_id,receipt_id,authorized_amount_cents)
    values(${refund!.id},${payment.id},100) returning id`;
  async function state() {
    const data = await operations({
      view: "payments",
      paymentSearch: payment.reference_code,
    });
    return data.paymentRows[0]!.paymentState;
  }
  try {
    expect(await state()).toBe("paid");
    await sql`update payout_allocations set settled_amount_cents=40 where id=${allocation!.id}`;
    expect(await state()).toBe("partially_refunded");
    await sql`update payout_allocations set settled_amount_cents=100 where id=${allocation!.id}`;
    expect(await state()).toBe("refunded");
  } finally {
    await sql`delete from payout_allocations where id=${allocation!.id}`;
    await sql`delete from refund_authorizations where id=${refund!.id}`;
  }
  const [returned] =
    await sql`insert into payment_returns(order_id,kind,amount_cents,reason)
    values(${order.id},'excess_return',100,'Test excess return') returning id`;
  const [returnAllocation] =
    await sql`insert into payout_allocations(payment_return_id,receipt_id,authorized_amount_cents,settled_amount_cents)
    values(${returned!.id},${payment.id},100,100) returning id`;
  try {
    expect(await state()).toBe("returned");
  } finally {
    await sql`delete from payout_allocations where id=${returnAllocation!.id}`;
    await sql`delete from payment_returns where id=${returned!.id}`;
  }
});
