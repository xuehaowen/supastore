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
  summarizeSalesReport,
  type SalesReportRow,
} from "@/domain/sales-report";
import {
  accumulateRewardComponentRefunds,
  type RewardSnapshot,
  type RewardComponentRefund,
} from "@/domain/rewards";
import { creditHash } from "../store-credit/credit-operations";

export async function salesReportInTransaction(
  tx: Transaction,
  start: string,
  endExclusive: string,
) {
  reportDate(start);
  reportDate(endExclusive);
  if (
    start >= endExclusive ||
    Date.parse(endExclusive) - Date.parse(start) > 3660 * 86400000
  )
    throw new DomainError("Choose a reporting period up to ten years.");
  const [store] = await tx.select().from(storeSettings).limit(1);
  if (!store) throw new DomainError("Set up the store first.");
  const startTime = sql`${start}::date::timestamp AT TIME ZONE ${store.timezone}`;
  const endTime = sql`${endExclusive}::date::timestamp AT TIME ZONE ${store.timezone}`;
  const rows: SalesReportRow[] = [];
  const append = (row: SalesReportRow) => {
    rows.push(row);
  };
  const sales = await tx.execute(sql`
    SELECT o.id,o.purchase_total_cents,q.total_payable_cents AS quote_total_cents,q.inclusive_tax_cents+q.exclusive_tax_cents AS tax_cents,
      (f.confirmed_at AT TIME ZONE ${store.timezone})::date::text AS date
    FROM orders o JOIN quotes q ON q.id=o.quote_id
    JOIN (SELECT order_id,min(created_at) AS confirmed_at FROM (
      SELECT order_id,created_at FROM confirmation_funding
      UNION ALL SELECT aggregate_id AS order_id,created_at FROM outbox_events WHERE aggregate_type='order' AND event_type='order.confirmed'
    ) confirmation_events GROUP BY order_id) f ON f.order_id=o.id
    WHERE f.confirmed_at >= ${startTime} AND f.confirmed_at < ${endTime}`);
  for (const row of sales) {
    if (
      Number(row.tax_cents) > 0 &&
      Number(row.purchase_total_cents) !== Number(row.quote_total_cents)
    )
      throw new DomainError(
        "A historical taxable order has revised prices without revised tax. Review its accepted tax before generating this report.",
      );
    append({
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
  const refunds = await tx.execute(sql`
    SELECT r.*,o.purchase_total_cents,o.reward_snapshot,q.total_payable_cents AS quote_total_cents,q.inclusive_tax_cents+q.exclusive_tax_cents AS purchase_tax_cents,
      (r.created_at AT TIME ZONE ${store.timezone})::date::text AS date,
      COALESCE((SELECT sum(a.authorized_amount_cents) FROM payout_allocations a WHERE a.refund_authorization_id=r.id),0) AS external_cents,
      COALESCE((SELECT sum(c.amount_cents) FROM store_credit_refund_settlements c WHERE c.refund_authorization_id=r.id),0) AS credit_cents
    FROM refund_authorizations r JOIN orders o ON o.id=r.order_id JOIN quotes q ON q.id=o.quote_id
    WHERE EXISTS(SELECT 1 FROM confirmation_funding f WHERE f.order_id=o.id)
      AND r.created_at < ${endTime}
      AND EXISTS(SELECT 1 FROM refund_authorizations period WHERE period.order_id=o.id AND period.created_at >= ${startTime} AND period.created_at < ${endTime})
    ORDER BY r.order_id,r.created_at,r.id`);
  const histories = new Map<
    string,
    {
      amount: number;
      tax: number;
      source: {
        externalCents: number;
        creditCents: number;
        componentRefunds: RewardComponentRefund[] | null;
      }[];
    }
  >();
  for (const row of refunds) {
    if (
      Number(row.purchase_tax_cents) > 0 &&
      Number(row.purchase_total_cents) !== Number(row.quote_total_cents)
    )
      throw new DomainError(
        "A historical taxable refund has revised prices without revised tax. Review its accepted tax before generating this report.",
      );
    const orderId = String(row.order_id);
    const history = histories.get(orderId) ?? { amount: 0, tax: 0, source: [] };
    const remainingPurchase = Math.max(
      0,
      Number(row.purchase_total_cents) - history.amount,
    );
    const amount = Math.min(Number(row.amount_cents), remainingPurchase);
    if (!amount) continue; // Cancellation surplus is a payout, not refunded sales.
    history.amount += amount;
    history.source.push({
      externalCents: Number(row.external_cents),
      creditCents: Number(row.credit_cents),
      componentRefunds: row.component_refunds as RewardComponentRefund[] | null,
    });
    const snapshot = row.reward_snapshot as RewardSnapshot | null;
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
      const allocated = accumulateRewardComponentRefunds(
        snapshot,
        history.source,
      );
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
    histories.set(orderId, history);
    if (String(row.date) < start || String(row.date) >= endExclusive) continue;
    append({
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
  const collections = await tx.execute(sql`
    SELECT 'receipt:'||r.id AS id,r.order_id,r.amount_cents AS amount,a.account_type AS method,r.created_at,'receipt' AS kind,'Recorded collection' AS reason
    FROM payment_receipts r JOIN payment_accounts a ON a.id=r.payment_account_id WHERE r.created_at >= ${startTime} AND r.created_at < ${endTime}
    UNION ALL
    SELECT 'correction:'||c.id,r.order_id,c.delta_amount_cents,a.account_type,c.created_at,'receipt_correction',c.reason
    FROM payment_receipt_corrections c JOIN payment_receipts r ON r.id=c.receipt_id JOIN payment_accounts a ON a.id=r.payment_account_id
    WHERE c.created_at >= ${startTime} AND c.created_at < ${endTime}`);
  for (const row of collections)
    append({
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
  const payouts = await tx.execute(sql`
    SELECT t.id,t.created_at,t.customer_settlement_cents,t.erroneous_disbursement_cents,r.order_id,a.account_type
    FROM outgoing_transfers t JOIN payout_attempts p ON p.id=t.payout_attempt_id JOIN payout_allocations x ON x.id=p.allocation_id
    JOIN payment_receipts r ON r.id=x.receipt_id JOIN payment_accounts a ON a.id=r.payment_account_id
    WHERE t.created_at >= ${startTime} AND t.created_at < ${endTime}`);
  for (const row of payouts)
    append({
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
  const credits = await tx.execute(
    sql`SELECT id,order_id,amount_cents,kind,reason,created_at FROM store_credit_entries WHERE created_at >= ${startTime} AND created_at < ${endTime}`,
  );
  for (const row of credits)
    append({
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
  const outside = await tx.execute(
    sql`SELECT * FROM outside_sales_adjustments WHERE sale_date >= ${start}::date AND sale_date < ${endExclusive}::date`,
  );
  for (const row of outside)
    append({
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
  const [liability] = await tx.execute(
    sql`SELECT COALESCE(sum(amount_cents),0)::bigint AS amount FROM store_credit_entries WHERE created_at < ${endTime}`,
  );
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  return {
    start,
    endExclusive,
    timezone: store.timezone,
    currency: store.currency,
    precision: store.precision,
    rows,
    totals: summarizeSalesReport(rows),
    closingCreditLiabilityCents: Number(liability!.amount),
  };
}

export async function generateSalesReport(input: {
  actorUserId: string;
  start: string;
  endExclusive: string;
}) {
  return db.transaction(
    async (tx) => {
      await verifyStaffInTransaction(tx, input.actorUserId);
      return salesReportInTransaction(tx, input.start, input.endExclusive);
    },
    { isolationLevel: "repeatable read" },
  );
}

/** A durable periodic check; store lock serializes configuration and duplicate alerts. */
export async function checkSalesThreshold(actorUserId?: string, date?: string) {
  return db.transaction(async (tx) => {
    if (actorUserId) await verifyStaffInTransaction(tx, actorUserId);
    const [store] = await tx.select().from(storeSettings).for("update");
    if (!store) return null;
    const policy = commercePolicy(store.commercePolicy);
    if (!policy.salesThresholdCents) return null;
    const period = fiscalReportPeriod(
      date ?? localReportDate(new Date(), store.timezone),
      policy.fiscalYearStartMonth,
    );
    const report = await salesReportInTransaction(
      tx,
      period.start,
      period.endExclusive,
    );
    if (report.totals.netSalesCents < policy.salesThresholdCents) return null;
    const [alert] = await tx
      .insert(salesThresholdAlerts)
      .values({
        fiscalStart: period.start,
        thresholdCents: policy.salesThresholdCents,
        observedNetCents: String(report.totals.netSalesCents),
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
          observedNetCents: report.totals.netSalesCents,
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
        observedNetCents: report.totals.netSalesCents,
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
