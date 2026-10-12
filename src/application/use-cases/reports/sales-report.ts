import { and, eq, sql } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  storeSettings,
  outsideSalesAdjustments,
  salesThresholdAlerts,
  auditRecords,
  outboxEvents,
  eventDeliveries,
  staffMemberships,
} from "@/infrastructure/db/schema";
import type { Transaction } from "@/application/common/transaction";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { ConflictError, DomainError } from "@/application/common/errors";
import {
  parseActionInteger,
  parseActionRequiredText,
  parseActionUuid,
} from "@/application/common/request-validation";
import { commercePolicy } from "@/domain/commerce-policy";
import {
  fiscalReportPeriod,
  localReportDate,
  reportDate,
} from "@/domain/sales-report";
import {
  createRewardRefundAccumulator,
  type RewardSnapshot,
  type RewardComponentRefund,
} from "@/domain/rewards";
import { creditHash } from "../store-credit/credit-operations";
import {
  createReportWorkspace,
  reportAmount,
  reportRow,
  summarizeWorkspace,
} from "./report-workspace";
export async function exportSalesReport(input: {
  actorUserId: string;
  start: string;
  endExclusive: string;
  signal?: AbortSignal;
}) {
  const { spoolSalesReport } = await import("./export-sales-report");
  return spoolSalesReport(input);
}

export async function prepareSalesReport(
  tx: Transaction,
  start: string,
  endExclusive: string,
  signal?: AbortSignal,
) {
  try {
    reportDate(start);
    reportDate(endExclusive);
  } catch {
    throw new DomainError("Choose valid YYYY-MM-DD reporting dates.");
  }
  if (
    start >= endExclusive ||
    Date.parse(endExclusive) - Date.parse(start) > 3660 * 86400000
  )
    throw new DomainError("Choose a reporting period up to ten years.");
  const [store] = await tx.select().from(storeSettings).limit(1);
  if (!store) throw new DomainError("Set up the store first.");
  const startTime = sql`${start}::date::timestamp AT TIME ZONE ${store.timezone}`;
  const endTime = sql`${endExclusive}::date::timestamp AT TIME ZONE ${store.timezone}`;
  const workspace = await createReportWorkspace(tx, signal);
  const append = workspace.append;
  const sales = workspace.source(sql`
    SELECT o.id,o.purchase_total_cents,q.total_payable_cents AS quote_total_cents,q.inclusive_tax_cents+q.exclusive_tax_cents AS tax_cents,
      (f.confirmed_at AT TIME ZONE ${store.timezone})::date::text AS date
    FROM orders o JOIN quotes q ON q.id=o.quote_id
    JOIN (SELECT order_id,min(created_at) AS confirmed_at FROM (
      SELECT order_id,created_at FROM confirmation_funding
      UNION ALL SELECT aggregate_id AS order_id,created_at FROM outbox_events WHERE aggregate_type='order' AND event_type='order.confirmed'
    ) confirmation_events GROUP BY order_id) f ON f.order_id=o.id
    WHERE f.confirmed_at >= ${startTime} AND f.confirmed_at < ${endTime}`);
  for await (const row of sales) {
    if (
      Number(row.tax_cents) > 0 &&
      Number(row.purchase_total_cents) !== Number(row.quote_total_cents)
    )
      throw new DomainError(
        "A historical taxable order has revised prices without revised tax. Review its accepted tax before generating this report.",
      );
    await append({
      id: `sale:${row.id}`,
      date: String(row.date),
      kind: "sale",
      orderId: String(row.id),
      method: "all funding",
      netCents: Number(row.purchase_total_cents) - Number(row.tax_cents),
      taxCents: Number(row.tax_cents),
      collectionCents: 0,
      payoutCents: 0,
      creditLiabilityDeltaCents: 0,
      reason: "Confirmed purchase; credit funding included once",
    });
  }

  // Include earlier refunds only for orders with a refund in this period, to
  // retain cumulative tax rounding and detailed original-source caps.
  const refunds = workspace.source(sql`
    SELECT r.*,o.purchase_total_cents,o.reward_snapshot,q.total_payable_cents AS quote_total_cents,q.inclusive_tax_cents+q.exclusive_tax_cents AS purchase_tax_cents,
      (r.created_at AT TIME ZONE ${store.timezone})::date::text AS date,
      COALESCE((SELECT sum(a.authorized_amount_cents) FROM payout_allocations a WHERE a.refund_authorization_id=r.id),0) AS external_cents,
      COALESCE((SELECT sum(c.amount_cents) FROM store_credit_refund_settlements c WHERE c.refund_authorization_id=r.id),0) AS credit_cents
    FROM refund_authorizations r JOIN orders o ON o.id=r.order_id JOIN quotes q ON q.id=o.quote_id
    WHERE EXISTS(SELECT 1 FROM confirmation_funding f WHERE f.order_id=o.id)
      AND r.created_at < ${endTime}
      AND EXISTS(SELECT 1 FROM refund_authorizations period WHERE period.order_id=o.id AND period.created_at >= ${startTime} AND period.created_at < ${endTime})
    ORDER BY r.order_id,r.created_at,r.id`);
  let lastOrderId: string | undefined;
  let history: {
    amount: number;
    tax: number;
    fold?: ReturnType<typeof createRewardRefundAccumulator>;
    foldError?: unknown;
  } = { amount: 0, tax: 0 };
  for await (const row of refunds) {
    if (
      Number(row.purchase_tax_cents) > 0 &&
      Number(row.purchase_total_cents) !== Number(row.quote_total_cents)
    )
      throw new DomainError(
        "A historical taxable refund has revised prices without revised tax. Review its accepted tax before generating this report.",
      );
    const orderId = String(row.order_id);
    const snapshot = row.reward_snapshot as RewardSnapshot | null;
    if (lastOrderId !== orderId) {
      lastOrderId = orderId;
      history = {
        amount: 0,
        tax: 0,
        ...(snapshot ? { fold: createRewardRefundAccumulator(snapshot) } : {}),
      };
    }
    const remainingPurchase = Math.max(
      0,
      Number(row.purchase_total_cents) - history.amount,
    );
    const amount = Math.min(Number(row.amount_cents), remainingPurchase);
    if (!amount) continue; // Cancellation surplus is a payout, not refunded sales.
    history.amount += amount;
    // Cancellation can return surplus beyond accepted purchase funding. Its tax
    // calculation is separate; replay errors apply when a normal refund needs the fold.
    if (history.fold && !history.foldError) {
      try {
        history.fold.add({
          externalCents: Number(row.external_cents),
          creditCents: Number(row.credit_cents),
          componentRefunds: row.component_refunds as
            RewardComponentRefund[] | null,
        });
      } catch (error) {
        history.foldError = error;
      }
    }
    let cumulativeTax: number;
    if (row.kind === "cancellation_refund") {
      cumulativeTax =
        history.tax +
        Number(
          (BigInt(amount) *
            BigInt(Math.max(0, Number(row.purchase_tax_cents) - history.tax))) /
            BigInt(remainingPurchase),
        );
    } else if (snapshot) {
      if (history.foldError) throw history.foldError;
      const allocated = history.fold!.value();
      cumulativeTax = snapshot.allocations
        .filter((item) => item.type === "tax")
        .reduce(
          (sum, item) =>
            sum + allocated.external[item.id] + allocated.credit[item.id],
          0,
        );
    } else
      cumulativeTax = row.purchase_total_cents
        ? Number(
            (BigInt(history.amount) * BigInt(Number(row.purchase_tax_cents))) /
              BigInt(Number(row.purchase_total_cents)),
          )
        : 0;
    const tax = cumulativeTax - history.tax;
    history.tax = cumulativeTax;
    if (String(row.date) < start || String(row.date) >= endExclusive) continue;
    await append({
      id: `refund:${row.id}`,
      date: String(row.date),
      kind: "refund",
      orderId,
      method: "original sources",
      netCents: -(amount - tax),
      taxCents: -tax,
      collectionCents: 0,
      payoutCents: 0,
      creditLiabilityDeltaCents: 0,
      reason: String(row.reason),
    });
  }
  const collections = workspace.source(sql`
    SELECT 'receipt:'||r.id AS id,r.order_id,r.amount_cents AS amount,a.account_type AS method,r.created_at,'receipt' AS kind,'Recorded collection' AS reason
    FROM payment_receipts r JOIN payment_accounts a ON a.id=r.payment_account_id WHERE r.created_at >= ${startTime} AND r.created_at < ${endTime}
    UNION ALL
    SELECT 'correction:'||c.id,r.order_id,c.delta_amount_cents,a.account_type,c.created_at,'receipt_correction',c.reason
    FROM payment_receipt_corrections c JOIN payment_receipts r ON r.id=c.receipt_id JOIN payment_accounts a ON a.id=r.payment_account_id
    WHERE c.created_at >= ${startTime} AND c.created_at < ${endTime}`);
  for await (const row of collections)
    await append({
      id: String(row.id),
      date: localReportDate(new Date(String(row.created_at)), store.timezone),
      kind: row.kind as "receipt" | "receipt_correction",
      orderId: String(row.order_id),
      method: String(row.method),
      netCents: 0,
      taxCents: 0,
      collectionCents: Number(row.amount),
      payoutCents: 0,
      creditLiabilityDeltaCents: 0,
      reason: String(row.reason),
    });
  const payouts = workspace.source(sql`
    SELECT t.id,t.created_at,t.customer_settlement_cents,t.erroneous_disbursement_cents,r.order_id,a.account_type
    FROM outgoing_transfers t JOIN payout_attempts p ON p.id=t.payout_attempt_id JOIN payout_allocations x ON x.id=p.allocation_id
    JOIN payment_receipts r ON r.id=x.receipt_id JOIN payment_accounts a ON a.id=r.payment_account_id
    WHERE t.created_at >= ${startTime} AND t.created_at < ${endTime}`);
  for await (const row of payouts)
    await append({
      id: `payout:${row.id}`,
      date: localReportDate(new Date(String(row.created_at)), store.timezone),
      kind: "payout",
      orderId: String(row.order_id),
      method: String(row.account_type),
      netCents: 0,
      taxCents: 0,
      collectionCents: 0,
      payoutCents: Number(row.customer_settlement_cents),
      creditLiabilityDeltaCents: 0,
      reason: `Actual customer settlement; erroneous disbursement ${row.erroneous_disbursement_cents} minor units excluded`,
    });
  const credits = workspace.source(
    sql`SELECT id,order_id,amount_cents,kind,reason,created_at FROM store_credit_entries WHERE created_at >= ${startTime} AND created_at < ${endTime}`,
  );
  for await (const row of credits)
    await append({
      id: `credit:${row.id}`,
      date: localReportDate(new Date(String(row.created_at)), store.timezone),
      kind: "credit",
      orderId: row.order_id ? String(row.order_id) : null,
      method: "store credit",
      netCents: 0,
      taxCents: 0,
      collectionCents: 0,
      payoutCents: 0,
      creditLiabilityDeltaCents: Number(row.amount_cents),
      reason: String(row.reason),
    });
  const outside = workspace.source(
    sql`SELECT * FROM outside_sales_adjustments WHERE sale_date >= ${start}::date AND sale_date < ${endExclusive}::date`,
  );
  for await (const row of outside)
    await append({
      id: `outside:${row.id}`,
      date: String(row.sale_date),
      kind: "outside_adjustment",
      orderId: null,
      method: "outside channel",
      netCents: Number(row.net_cents),
      taxCents: Number(row.tax_cents),
      collectionCents: 0,
      payoutCents: 0,
      creditLiabilityDeltaCents: 0,
      reason: String(row.reason),
    });
  workspace.checkTime();
  const [liability] = await tx.execute(
    sql`SELECT COALESCE(sum(amount_cents),0)::text AS amount FROM store_credit_entries WHERE created_at < ${endTime}`,
  );
  workspace.checkTime();
  await workspace.finish();
  const totals = await summarizeWorkspace(tx, workspace.table);
  workspace.checkTime();
  return {
    start,
    endExclusive,
    timezone: store.timezone,
    currency: store.currency,
    precision: store.precision,
    table: workspace.table,
    totals,
    closingCreditLiabilityCents: reportAmount(liability!.amount),
  };
}

export async function salesReportInTransaction(
  tx: Transaction,
  start: string,
  endExclusive: string,
  page = 1,
) {
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000)
    throw new DomainError("Invalid report page.");
  const { table, ...report } = await prepareSalesReport(
    tx,
    start,
    endExclusive,
  );
  const rows = await tx.execute(
    sql`SELECT * FROM ${table} ORDER BY date, id LIMIT 101 OFFSET ${(page - 1) * 100}`,
  );
  const [count] = await tx.execute(
    sql`SELECT count(*)::text AS total FROM ${table}`,
  );
  return {
    ...report,
    rows: rows.slice(0, 100).map(reportRow),
    totalRows: reportAmount(count!.total),
    hasNext: rows.length > 100,
    page,
  };
}

export async function generateSalesReport(input: {
  actorUserId: string;
  start: string;
  endExclusive: string;
  page?: number;
}) {
  return db.transaction(
    async (tx) => {
      await verifyStaffInTransaction(tx, input.actorUserId);
      return salesReportInTransaction(
        tx,
        input.start,
        input.endExclusive,
        input.page,
      );
    },
    { isolationLevel: "repeatable read" },
  );
}

/** Calculate a read snapshot first, then briefly lock settings to validate and emit an alert. */
export async function checkSalesThreshold(actorUserId?: string, date?: string) {
  const observed = await db.transaction(
    async (tx) => {
      if (actorUserId) await verifyStaffInTransaction(tx, actorUserId);
      const [store] = await tx.select().from(storeSettings).limit(1);
      if (!store) return null;
      const policy = commercePolicy(store.commercePolicy);
      if (!policy.salesThresholdCents) return null;
      const period = fiscalReportPeriod(
        date ?? localReportDate(new Date(), store.timezone),
        policy.fiscalYearStartMonth,
      );
      const report = await prepareSalesReport(
        tx,
        period.start,
        period.endExclusive,
      );
      if (report.totals.netSalesCents < policy.salesThresholdCents) return null;
      return {
        storeId: store.id,
        timezone: store.timezone,
        currency: store.currency,
        precision: store.precision,
        month: policy.fiscalYearStartMonth,
        threshold: policy.salesThresholdCents,
        period,
        netCents: report.totals.netSalesCents,
      };
    },
    { isolationLevel: "repeatable read" },
  );
  if (!observed) return null;
  return db.transaction(async (tx) => {
    if (actorUserId) await verifyStaffInTransaction(tx, actorUserId);
    const [store] = await tx
      .select()
      .from(storeSettings)
      .where(eq(storeSettings.id, observed.storeId))
      .for("update");
    if (!store) return null;
    const policy = commercePolicy(store.commercePolicy);
    const period = observed.period;
    if (
      store.timezone !== observed.timezone ||
      store.currency !== observed.currency ||
      store.precision !== observed.precision ||
      policy.fiscalYearStartMonth !== observed.month ||
      policy.salesThresholdCents !== observed.threshold ||
      fiscalReportPeriod(
        date ?? localReportDate(new Date(), store.timezone),
        policy.fiscalYearStartMonth,
      ).start !== period.start
    )
      return null;
    const [alert] = await tx
      .insert(salesThresholdAlerts)
      .values({
        fiscalStart: period.start,
        thresholdCents: policy.salesThresholdCents,
        observedNetCents: String(observed.netCents),
      })
      .onConflictDoNothing()
      .returning();
    if (!alert) return null;
    const [sequence] = await tx
      .select({
        value: sql<number>`coalesce(max(${outboxEvents.sequence}),0)+1`,
      })
      .from(outboxEvents)
      .where(eq(outboxEvents.aggregateId, store.id));
    const [event] = await tx
      .insert(outboxEvents)
      .values({
        aggregateType: "store",
        aggregateId: store.id,
        sequence: Number(sequence!.value),
        eventType: "sales.threshold_reached",
        payload: {
          fiscalStart: period.start,
          fiscalEndExclusive: period.endExclusive,
          thresholdCents: policy.salesThresholdCents,
          observedNetCents: observed.netCents,
          currency: store.currency,
          precision: store.precision,
          basis:
            "Confirmed net sales excluding tax, less authorized purchase refunds, plus outside adjustments",
        },
      })
      .returning();
    const owners = await tx
      .select()
      .from(staffMemberships)
      .where(
        and(
          eq(staffMemberships.role, "owner"),
          eq(staffMemberships.isActive, true),
        ),
      );
    if (owners.length)
      await tx.insert(eventDeliveries).values(
        owners.map((owner) => ({
          eventId: event!.id,
          recipient: owner.email,
          channel: "email" as const,
          audience: "staff" as const,
        })),
      );
    await tx.insert(auditRecords).values({
      entityType: "store",
      entityId: store.id,
      actorId: actorUserId ?? "sales-report-worker",
      action: "sales.threshold_reached",
      details: {
        alertId: alert.id,
        fiscalStart: period.start,
        observedNetCents: observed.netCents,
        thresholdCents: policy.salesThresholdCents,
      },
    });
    return alert.id;
  });
}

export async function recordOutsideSales(input: {
  actorUserId: string;
  saleDate: string;
  netCents: number;
  taxCents: number;
  reason: string;
  requestKey: string;
}) {
  const saleDate = reportDate(input.saleDate);
  const netCents = parseActionInteger(
    input.netCents,
    "Outside net sales",
    -2147483647,
    2147483647,
  );
  const taxCents = parseActionInteger(
    input.taxCents,
    "Outside tax",
    -2147483647,
    2147483647,
  );
  if (!netCents && !taxCents)
    throw new DomainError("An adjustment must change net sales or tax.");
  const reason = parseActionRequiredText(
      input.reason,
      "Adjustment reason",
      500,
    ),
    requestKey = parseActionUuid(input.requestKey, "Request key");
  const payloadHash = creditHash([
    input.actorUserId,
    saleDate,
    netCents,
    taxCents,
    reason,
  ]);
  const result = await db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, input.actorUserId, "owner");
    await tx.select().from(storeSettings).for("update");
    const [retry] = await tx
      .select()
      .from(outsideSalesAdjustments)
      .where(eq(outsideSalesAdjustments.requestKey, requestKey));
    if (retry) {
      if (retry.payloadHash !== payloadHash)
        throw new ConflictError(
          "Adjustment request key was used with different input.",
        );
      return retry.id;
    }
    const [adjustment] = await tx
      .insert(outsideSalesAdjustments)
      .values({
        saleDate,
        netCents,
        taxCents,
        reason,
        actorId: input.actorUserId,
        requestKey,
        payloadHash,
      })
      .returning();
    await tx.insert(auditRecords).values({
      entityType: "outside_sales_adjustment",
      entityId: adjustment!.id,
      actorId: input.actorUserId,
      action: "sales.outside_adjusted",
      reason,
      details: { saleDate, netCents, taxCents },
    });
    return adjustment!.id;
  });
  await checkSalesThreshold(input.actorUserId, saleDate);
  return result;
}
