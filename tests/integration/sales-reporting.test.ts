import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { mkdtemp, readdir, rmdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
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
import {
  generateSalesReport,
  salesReportInTransaction,
  exportSalesReport,
  recordOutsideSales,
  checkSalesThreshold,
} from "@/application/use-cases/reports/sales-report";
import { refundPurchase } from "@/application/use-cases/store-credit/purchase-refund";
import { spoolSalesReport } from "@/application/use-cases/reports/export-sales-report";
import { provisionRuntimeRole } from "../../scripts/runtime-role.mjs";
import { getAdminOperations } from "@/application/queries/admin-operations";
import { correctReceipt } from "@/application/use-cases/payments/correct-receipt";
import { summarizeSalesReport, salesReportCsv } from "@/domain/sales-report";
import { commercePolicy } from "@/domain/commerce-policy";
import { createRewardSnapshot } from "@/domain/rewards";
const server = process.env.TRANSLATION_TEST_DATABASE_URL;
describe.skipIf(!server)("generic sales reporting PostgreSQL", () => {
  const name = `reports_test_${randomUUID().replaceAll("-", "")}`;
  const owner = "reports-owner";
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });
  let admin: ReturnType<typeof postgres>, client: ReturnType<typeof postgres>;
  const methods = new Map<string, string>();
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
    await client`insert into staff_memberships(user_id,email,role) values(${owner},'owner@reports.test','owner')`;
    await client`insert into staff_memberships(user_id,email,role) values('reports-staff','staff@reports.test','staff')`;
    await client`insert into store_settings(store_name,support_email,setup_completed,email_verified_at,timezone) values('Reporting fixture','support@reports.test',true,now(),'America/Los_Angeles')`;
    for (const type of ["cash", "zelle", "venmo", "other", "stripe"]) {
      const [account] =
        await client`insert into payment_accounts(account_name,account_identifier,account_type) values(${type},${type},${type}) returning id`;
      methods.set(type, account!.id);
    }
  }, 30000);
  afterAll(async () => {
    if (client) await client.end();
    if (admin) {
      await admin.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await admin.end();
    }
  });
  async function purchase(input: {
    net: number;
    tax?: number;
    receipts: { method: string; amount: number }[];
    credit?: number;
    at?: string;
  }) {
    const tax = input.tax ?? 0,
      credit = input.credit ?? 0;
    const total = input.net + tax,
      at = input.at ?? "2026-01-10T20:00:00Z";
    const [cart] =
      await client`insert into carts(guest_session_id) values(${randomUUID()}) returning id`;
    const [quote] =
      await client`insert into quotes(cart_id,cart_revision,merchandise_subtotal_cents,shipping_cents,exclusive_tax_cents,inclusive_tax_cents,total_payable_cents,items_snapshot,shipping_snapshot,expires_at)
      values(${cart!.id},1,${input.net},0,${tax},0,${total},'[]','{}',now()+interval '1 hour') returning id`;
    const [customer] =
      await client`insert into customers(name,email) values('Report customer',${`${randomUUID()}@reports.test`}) returning id`;
    const snapshot = createRewardSnapshot({
      policyVersion: "report-fixture",
      customerId: customer!.id,
      enabled: false,
      verified: true,
      rateBasisPoints: 500,
      components: [
        {
          id: "merchandise",
          type: "merchandise",
          eligible: true,
          amount: input.net,
        },
        { id: "tax", type: "tax", eligible: false, amount: tax },
      ],
      externalAmount: total - credit,
    });
    const [order] =
      await client`insert into orders(source_cart_id,quote_id,reference_code,lifecycle_status,purchase_total_cents,credit_applied_cents,guest_email,guest_name,customer_id,shipping_address_snapshot,terms_snapshot,reward_snapshot)
      values(${cart!.id},${quote!.id},${randomUUID()},'confirmed',${total},${credit},'customer@reports.test','Report customer',${customer!.id},'{}','{"currency":"USD","precision":2}',${JSON.stringify(snapshot)}::jsonb) returning id`;
    const receiptIds = [];
    for (const receipt of input.receipts) {
      const reference = randomUUID();
      const [saved] =
        await client`insert into payment_receipts(order_id,payment_account_id,amount_cents,raw_reference,normalized_reference,recorded_by_user_id,created_at)
        values(${order!.id},${methods.get(receipt.method)!},${receipt.amount},${reference},${reference},${owner},${at}::timestamptz) returning id`;
      receiptIds.push(saved!.id);
      await client`insert into confirmation_funding(order_id,receipt_id,funded_amount_cents,created_at) values(${order!.id},${saved!.id},${receipt.amount},${at}::timestamptz)`;
    }
    let accountId: string | undefined;
    if (credit) {
      const [account] =
        await client`insert into store_credit_accounts(customer_id,currency,precision) values(${customer!.id},'USD',2) returning id`;
      accountId = account!.id;
      const [issue] =
        await client`insert into store_credit_entries(account_id,amount_cents,kind,reason,actor_id,request_key,payload_hash,created_at)
        values(${accountId!},${credit},'issue','Opening credit',${owner},${randomUUID()},'fixture',${at}::timestamptz) returning id`;
      const [debit] =
        await client`insert into store_credit_entries(account_id,amount_cents,kind,order_id,reason,actor_id,request_key,payload_hash,created_at)
        values(${accountId!},${-credit},'debit',${order!.id},'Confirmed credit',${owner},${randomUUID()},'fixture',${at}::timestamptz) returning id`;
      const [lot] =
        await client`insert into credit_source_lots(account_id,source_entry_id,kind,remaining_cents) values(${accountId!},${issue!.id},'merchant',0) returning id`;
      const [hold] =
        await client`insert into store_credit_reservations(order_id,account_id,amount_cents,status,debit_entry_id) values(${order!.id},${accountId!},${credit},'captured',${debit!.id}) returning id`;
      await client`insert into credit_source_allocations(reservation_id,lot_id,amount_cents) values(${hold!.id},${lot!.id},${credit})`;
      await client`insert into confirmation_funding(order_id,credit_entry_id,funded_amount_cents,created_at) values(${order!.id},${debit!.id},${credit},${at}::timestamptz)`;
    }
    return {
      orderId: order!.id as string,
      receiptIds: receiptIds as string[],
      accountId,
    };
  }
  it("counts every external method and mixed credit purchase once without join multiplication", async () => {
    const accepted = await purchase({
      net: 9000,
      tax: 1000,
      credit: 3000,
      receipts: [
        { method: "cash", amount: 1000 },
        { method: "zelle", amount: 1000 },
        { method: "venmo", amount: 1000 },
        { method: "other", amount: 1000 },
        { method: "stripe", amount: 3000 },
      ],
    });
    const report = await generateSalesReport({
      actorUserId: owner,
      start: "2026-01-01",
      endExclusive: "2026-02-01",
    });
    const rows = report.rows.filter((row) => row.orderId === accepted.orderId);
    expect(rows.filter((row) => row.kind === "sale")).toHaveLength(1);
    expect(
      new Set(
        rows.filter((row) => row.kind === "receipt").map((row) => row.method),
      ),
    ).toEqual(new Set(["cash", "zelle", "venmo", "other", "stripe"]));
    expect(summarizeSalesReport(rows)).toMatchObject({
      netSalesCents: 9000,
      taxCents: 1000,
      grossSalesCents: 10000,
      collectionsCents: 7000,
      creditLiabilityDeltaCents: -3000,
    });
    const request = {
      orderId: accepted.orderId,
      amountCents: 5000,
      ownerUserId: owner,
      reason: "Half purchase returned",
      requestKey: randomUUID(),
    };
    await Promise.all([refundPurchase(request), refundPurchase(request)]);
    const refunded = await generateSalesReport({
      actorUserId: owner,
      start: "2000-01-01",
      endExclusive: "2009-01-01",
    });
    expect(
      refunded.rows.filter((row) => row.orderId === accepted.orderId),
    ).toHaveLength(0);
    const nowYear = new Date().getUTCFullYear();
    const current = await generateSalesReport({
      actorUserId: owner,
      start: `${nowYear}-01-01`,
      endExclusive: `${nowYear + 1}-01-01`,
    });
    const refundRows = current.rows.filter(
      (row) => row.orderId === accepted.orderId && row.kind === "refund",
    );
    expect(refundRows).toHaveLength(1);
    expect(refundRows[0]).toMatchObject({ netCents: -4500, taxCents: -500 });
    expect(
      (
        await client`select balance_cents from store_credit_accounts where id=${accepted.accountId!}`
      )[0]!.balance_cents,
    ).toBe(1500);
    expect(
      salesReportCsv(rows)
        .split("\r\n")
        .filter((line) => line.includes(`sale:${accepted.orderId}`)),
    ).toHaveLength(1);
    const [allocation] =
      await client`select id,receipt_id from payout_allocations where refund_authorization_id=${request.requestKey} order by id limit 1`;
    const [destination] =
      await client`insert into payout_destination_verifications(receipt_id,destination_data,verified_by_user_id) values(${allocation!.receipt_id},'{}',${owner}) returning id`;
    const [attempt] =
      await client`insert into payout_attempts(allocation_id,destination_verification_id,claimed_amount_cents,claimed_by_user_id) values(${allocation!.id},${destination!.id},10,${owner}) returning id`;
    await client`insert into outgoing_transfers(payout_attempt_id,actual_amount_cents,transfer_reference,customer_settlement_cents,erroneous_disbursement_cents,destination_data_snapshot,reconciled_by_user_id)
      values(${attempt!.id},15,${randomUUID()},10,5,'{}',${owner})`;
    const settled = await generateSalesReport({
      actorUserId: owner,
      start: `${nowYear}-01-01`,
      endExclusive: `${nowYear + 1}-01-01`,
    });
    const paidRows = settled.rows.filter(
      (row) => row.orderId === accepted.orderId && row.kind === "payout",
    );
    expect(paidRows).toHaveLength(1);
    expect(paidRows[0]!.payoutCents).toBe(10);
    expect(paidRows[0]!.reason).toContain("5 minor units excluded");
  });
  it("attributes tax-only component refunds precisely and rejects changed retry identity", async () => {
    const accepted = await purchase({
      net: 4000,
      tax: 1000,
      receipts: [{ method: "other", amount: 5000 }],
    });
    const request = {
      orderId: accepted.orderId,
      ownerUserId: owner,
      amountCents: 1000,
      reason: "Tax correction",
      requestKey: randomUUID(),
      componentRefunds: [
        { componentId: "tax", externalCents: 1000, creditCents: 0 },
      ],
    };
    await refundPurchase(request);
    await expect(
      refundPurchase({
        ...request,
        componentRefunds: [
          { componentId: "merchandise", externalCents: 1000, creditCents: 0 },
        ],
      }),
    ).rejects.toThrow("different input");
    const year = new Date().getUTCFullYear();
    const report = await generateSalesReport({
      actorUserId: owner,
      start: `${year}-01-01`,
      endExclusive: `${year + 1}-01-01`,
    });
    const refund = report.rows.find(
      (row) => row.id === `refund:${request.requestKey}`,
    )!;
    expect(refund.taxCents).toBe(-1000);
    expect(refund.netCents + 0).toBe(0);
  });
  it("uses half-open merchant local dates across midnight", async () => {
    const before = await purchase({
      net: 100,
      receipts: [{ method: "other", amount: 100 }],
      at: "2026-01-02T07:59:59Z",
    });
    const after = await purchase({
      net: 100,
      receipts: [{ method: "other", amount: 100 }],
      at: "2026-01-02T08:00:00Z",
    });
    const report = await generateSalesReport({
      actorUserId: owner,
      start: "2026-01-01",
      endExclusive: "2026-01-02",
    });
    expect(report.rows.some((row) => row.orderId === before.orderId)).toBe(
      true,
    );
    expect(report.rows.some((row) => row.orderId === after.orderId)).toBe(
      false,
    );
  });
  it("retains confirmed zero-total orders without funding and refuses revised taxable history", async () => {
    const free = await purchase({
      net: 0,
      receipts: [],
      at: "2026-01-15T12:00:00Z",
    });
    await client`insert into outbox_events(aggregate_type,aggregate_id,event_type,payload,created_at) values('order',${free.orderId},'order.confirmed','{}','2026-01-15T12:00:00Z')`;
    const report = await generateSalesReport({
      actorUserId: owner,
      start: "2026-01-01",
      endExclusive: "2026-02-01",
    });
    expect(
      report.rows.find((row) => row.id === `sale:${free.orderId}`),
    ).toMatchObject({ netCents: 0, taxCents: 0 });
    const revised = await purchase({
      net: 100,
      tax: 10,
      receipts: [{ method: "other", amount: 110 }],
      at: "2040-01-02T12:00:00Z",
    });
    await client`update orders set purchase_total_cents=120 where id=${revised.orderId}`;
    await expect(
      generateSalesReport({
        actorUserId: owner,
        start: "2040-01-01",
        endExclusive: "2040-02-01",
      }),
    ).rejects.toThrow("revised prices without revised tax");
    await client`insert into refund_authorizations(order_id,kind,amount_cents,reason,authorized_by_user_id,created_at) values(${revised.orderId},'purchase_refund',10,'Historical refund',${owner},'2040-02-10T12:00:00Z')`;
    await expect(
      generateSalesReport({
        actorUserId: owner,
        start: "2040-02-01",
        endExclusive: "2040-03-01",
      }),
    ).rejects.toThrow("historical taxable refund");
    await client`update orders set purchase_total_cents=110 where id=${revised.orderId}`;
  });
  it("shows corrected collections separately from accepted sales and enforces report authorization", async () => {
    const accepted = await purchase({
      net: 1000,
      receipts: [{ method: "zelle", amount: 1000 }],
    });
    await correctReceipt({
      receiptId: accepted.receiptIds[0]!,
      deltaAmountCents: -100,
      reason: "Wrong recorded amount",
      ownerUserId: owner,
    });
    const year = new Date().getUTCFullYear();
    const report = await generateSalesReport({
      actorUserId: owner,
      start: `${year}-01-01`,
      endExclusive: `${year + 1}-01-01`,
    });
    const rows = report.rows.filter((row) => row.orderId === accepted.orderId);
    expect(rows.find((row) => row.kind === "receipt_correction")).toMatchObject(
      { collectionCents: -100, netCents: 0 },
    );
    const sales = await generateSalesReport({
      actorUserId: owner,
      start: "2026-01-01",
      endExclusive: "2026-02-01",
    });
    expect(
      sales.rows.find((row) => row.id === `sale:${accepted.orderId}`),
    ).toMatchObject({ netCents: 1000 });
    await expect(
      generateSalesReport({
        actorUserId: "outsider",
        start: "2026-01-01",
        endExclusive: "2026-02-01",
      }),
    ).rejects.toThrow();
  });
  it("caps cancellation refunds at purchase sales while retaining excess payout obligations", async () => {
    const accepted = await purchase({
      net: 1000,
      tax: 100,
      receipts: [{ method: "other", amount: 1100 }],
      at: "2041-01-05T12:00:00Z",
    });
    await client`insert into refund_authorizations(order_id,kind,amount_cents,reason,authorized_by_user_id,created_at) values(${accepted.orderId},'cancellation_refund',1500,'Cancel and return overpayment',${owner},'2041-01-10T12:00:00Z')`;
    const report = await generateSalesReport({
      actorUserId: owner,
      start: "2041-01-01",
      endExclusive: "2041-02-01",
    });
    expect(
      summarizeSalesReport(
        report.rows.filter((row) => row.orderId === accepted.orderId),
      ),
    ).toMatchObject({
      netSalesCents: 0,
      taxCents: 0,
      refundsAuthorizedCents: 1100,
    });
  });
  it("keeps outside adjustments append-only, retry-safe and owner-only with fiscal threshold deduplication", async () => {
    const policy = commercePolicy({
      fiscalYearStartMonth: 4,
      salesThresholdCents: 1000,
    });
    await client`update store_settings set commerce_policy=${JSON.stringify(policy)}::jsonb`;
    await recordOutsideSales({
      actorUserId: owner,
      saleDate: "2030-03-31",
      netCents: 5000,
      taxCents: 0,
      reason: "Prior fiscal year",
      requestKey: randomUUID(),
    });
    const request = {
      actorUserId: owner,
      saleDate: "2030-04-01",
      netCents: 1000,
      taxCents: 100,
      reason: "Market stall receipts",
      requestKey: randomUUID(),
    };
    const results = await Promise.all([
      recordOutsideSales(request),
      recordOutsideSales(request),
    ]);
    expect(results[0]).toBe(results[1]);
    await expect(
      recordOutsideSales({ ...request, netCents: 1001 }),
    ).rejects.toThrow("different input");
    await expect(
      recordOutsideSales({
        ...request,
        actorUserId: "reports-staff",
        requestKey: randomUUID(),
      }),
    ).rejects.toThrow();
    await expect(
      client`update outside_sales_adjustments set reason='rewrite' where id=${results[0]!}`,
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      client`delete from outside_sales_adjustments where id=${results[0]!}`,
    ).rejects.toMatchObject({ code: "23514" });
    await Promise.all([
      checkSalesThreshold(owner, "2030-05-01"),
      checkSalesThreshold(owner, "2030-05-01"),
    ]);
    expect(
      await client`select id from sales_threshold_alerts where fiscal_start='2030-04-01'`,
    ).toHaveLength(1);
    expect(
      await client`select id from outbox_events where event_type='sales.threshold_reached' and payload->>'fiscalStart'='2030-04-01'`,
    ).toHaveLength(1);
    const report = await generateSalesReport({
      actorUserId: owner,
      start: "2030-04-01",
      endExclusive: "2031-04-01",
    });
    expect(report.totals).toMatchObject({
      netSalesCents: 1000,
      taxCents: 100,
      collectionsCents: 0,
      outsideNetSalesCents: 1000,
    });
    await recordOutsideSales({
      actorUserId: owner,
      saleDate: "2030-05-01",
      netCents: -200,
      taxCents: -20,
      reason: "Compensating correction",
      requestKey: randomUUID(),
    });
    expect(
      (
        await generateSalesReport({
          actorUserId: owner,
          start: "2030-04-01",
          endExclusive: "2031-04-01",
        })
      ).totals.netSalesCents,
    ).toBe(800);
    await client`update store_settings set commerce_policy=${JSON.stringify(commercePolicy({}))}::jsonb`;
  });
  it("pages report evidence while keeping complete totals and exporting every row", async () => {
    await client`insert into outside_sales_adjustments(sale_date,net_cents,tax_cents,reason,actor_id,request_key,payload_hash)
      select '2060-01-01'::date,100,10,'Paged report fixture',${owner},gen_random_uuid(),'fixture' from generate_series(1,1005)`;
    const input = {
      actorUserId: owner,
      start: "2060-01-01",
      endExclusive: "2060-02-01",
    };
    const first = await generateSalesReport(input);
    expect(first.rows).toHaveLength(100);
    expect(first.totals).toMatchObject({
      netSalesCents: 100500,
      taxCents: 10050,
      grossSalesCents: 110550,
    });
    expect(first.totalRows).toBe(1005);
    expect(first.hasNext).toBe(true);
    const last = await generateSalesReport({ ...input, page: 11 });
    expect(last.rows).toHaveLength(5);
    expect(last.hasNext).toBe(false);
    expect(last.totals).toEqual(first.totals);
    const csv = await new Response(await exportSalesReport(input)).text();
    expect(csv.trimEnd().split("\r\n")).toHaveLength(1006);
  });
  it("keeps concurrent 10,000-row reports bounded and exports complete evidence", async () => {
    await client`insert into outside_sales_adjustments(sale_date,net_cents,tax_cents,reason,actor_id,request_key,payload_hash)
      select '2070-01-01'::date,100,10,'Scale report fixture',${owner},gen_random_uuid(),'fixture' from generate_series(1,10000)`;
    const input = {
      actorUserId: owner,
      start: "2070-01-01",
      endExclusive: "2070-02-01",
    };
    const directory = await mkdtemp(join(tmpdir(), "supastore-report-scale-"));
    const started = performance.now();
    try {
      const exportRows = async () => {
        const reader = (await spoolSalesReport(input, directory)).getReader();
        let lines = 0;
        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            for (const byte of value) if (byte === 10) lines++;
          }
          return lines;
        } finally {
          await reader.cancel();
          reader.releaseLock();
        }
      };
      const [firstResult, lastResult, exportResult] = await Promise.allSettled([
        generateSalesReport(input),
        generateSalesReport({ ...input, page: 100 }),
        exportRows(),
      ]);
      if (firstResult.status === "rejected") throw firstResult.reason;
      if (lastResult.status === "rejected") throw lastResult.reason;
      if (exportResult.status === "rejected") throw exportResult.reason;
      const first = firstResult.value,
        last = lastResult.value,
        lines = exportResult.value;
      expect(first.totalRows).toBe(10000);
      expect(last.totalRows).toBe(10000);
      expect(first.rows).toHaveLength(100);
      expect(last.rows).toHaveLength(100);
      expect(first.hasNext).toBe(true);
      expect(last.hasNext).toBe(false);
      expect(
        last.rows.some((row) =>
          first.rows.some((other) => other.id === row.id),
        ),
      ).toBe(false);
      expect(first.totals).toMatchObject({
        netSalesCents: 1000000,
        taxCents: 100000,
        grossSalesCents: 1100000,
      });
      expect(last.totals).toEqual(first.totals);
      expect(lines).toBe(10001);
      await vi.waitFor(async () =>
        expect(await readdir(directory)).toHaveLength(0),
      );
      console.log(
        JSON.stringify({
          metric: "isolated PostgreSQL report/export regression",
          sourceRows: 10000,
          concurrentReports: 3,
          elapsedMs: Math.round(performance.now() - started),
        }),
      );
    } finally {
      await rmdir(directory);
    }
  }, 60000);
  it("fails closed on report budgets and cleans temporary exports on cancellation", async () => {
    const input = {
      actorUserId: owner,
      start: "2060-01-01",
      endExclusive: "2060-02-01",
    };
    vi.stubEnv("REPORT_MAX_SOURCE_ROWS", "10");
    await expect(generateSalesReport(input)).rejects.toThrow(
      "source-row budget",
    );
    expect(
      await client`select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname like 'pg_temp_%' and c.relname like 'report_%'`,
    ).toHaveLength(0);
    const directory = await mkdtemp(join(tmpdir(), "supastore-report-test-"));
    try {
      await expect(spoolSalesReport(input, directory)).rejects.toThrow(
        "source-row budget",
      );
      expect(await readdir(directory)).toHaveLength(0);
      vi.unstubAllEnvs();
      const controller = new AbortController();
      const cancelled = spoolSalesReport(
        { ...input, signal: controller.signal },
        directory,
      );
      controller.abort();
      await expect(cancelled).rejects.toThrow("cancelled");
      expect(await readdir(directory)).toHaveLength(0);
      const reader = (await spoolSalesReport(input, directory)).getReader();
      await reader.read();
      await reader.cancel();
      await vi.waitFor(async () =>
        expect(await readdir(directory)).toHaveLength(0),
      );
    } finally {
      await rmdir(directory);
    }
  });
  it("supports reporting with the restricted runtime database role", async () => {
    await client.unsafe(`REVOKE TEMPORARY ON DATABASE "${name}" FROM PUBLIC`);
    await provisionRuntimeRole(client, {
      user: "reports_runtime",
      password: "synthetic-report-password",
    });
    const report = await drizzle(client, { schema }).transaction(
      async (tx) => {
        await tx.execute("SET LOCAL ROLE reports_runtime");
        return salesReportInTransaction(tx, "2060-01-01", "2060-02-01");
      },
      { isolationLevel: "repeatable read" },
    );
    expect(report.totalRows).toBe(1005);
    expect(report.totals.netSalesCents).toBe(100500);
    expect(report.rows).toHaveLength(100);
  });
  it("rejects oversized CSV exports before publishing a file and removes partial artifacts", async () => {
    await client`insert into outside_sales_adjustments(sale_date,net_cents,tax_cents,reason,actor_id,request_key,payload_hash)
      select '2061-01-01'::date,100,10,repeat('x',500),${owner},gen_random_uuid(),'fixture' from generate_series(1,2500)`;
    vi.stubEnv("REPORT_MAX_EXPORT_BYTES", "1048576");
    const directory = await mkdtemp(
      join(tmpdir(), "supastore-report-size-test-"),
    );
    try {
      await expect(
        spoolSalesReport(
          {
            actorUserId: owner,
            start: "2061-01-01",
            endExclusive: "2061-02-01",
          },
          directory,
        ),
      ).rejects.toThrow("file-size budget");
      expect(await readdir(directory)).toHaveLength(0);
    } finally {
      await rmdir(directory);
    }
  });
  it("uses canonical net sales and merchant confirmation dates on the dashboard", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2032-01-02T07:30:00Z"));
    const accepted = await purchase({
      net: 2000,
      tax: 200,
      receipts: [{ method: "cash", amount: 2200 }],
      at: "2032-01-02T06:30:00Z",
    });
    await client`update orders set created_at='2031-12-01T00:00:00Z' where id=${accepted.orderId}`;
    await purchase({
      net: 1000,
      receipts: [{ method: "cash", amount: 1000 }],
      at: "2032-01-02T08:00:00Z",
    });
    const [refund] =
      await client`insert into refund_authorizations(order_id,kind,amount_cents,reason,authorized_by_user_id,created_at)
      values (${accepted.orderId},'purchase_refund',550,'Dashboard refund',${owner},'2032-01-02T07:00:00Z') returning id`;
    await client`insert into payout_allocations(refund_authorization_id,receipt_id,authorized_amount_cents)
      values (${refund!.id},${accepted.receiptIds[0]!},550)`;
    await recordOutsideSales({
      actorUserId: owner,
      saleDate: "2032-01-01",
      netCents: 300,
      taxCents: 30,
      reason: "Dashboard outside sales",
      requestKey: randomUUID(),
    });
    const dashboard = await getAdminOperations({
      staffUserId: owner,
      view: "overview",
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
    });
    expect(dashboard.commerceSummary).toMatchObject({
      revenueCents: 1800,
      orderCount: 1,
      averageOrderCents: 2200,
    });
    expect(dashboard.salesTrend).toContainEqual({
      day: "2032-01-01",
      revenueCents: 1800,
      orders: 1,
    });
    expect(dashboard.salesTrend.some((day) => day.day === "2032-01-02")).toBe(
      false,
    );
  });
});
