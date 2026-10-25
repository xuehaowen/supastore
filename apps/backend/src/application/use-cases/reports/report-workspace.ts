import { randomUUID } from "node:crypto";
import { sql, type SQL, type SQLWrapper } from "drizzle-orm";
import type { Transaction } from "@/application/common/transaction";
import { DomainError } from "@/domain/errors";
import {
  summarizeSalesReport,
  type SalesReportRow,
} from "@/domain/sales-report";
import { databaseCursor } from "@/infrastructure/db/cursor";

export function reportBudgets() {
  const setting = (
    name: string,
    fallback: number,
    minimum: number,
    maximum: number,
  ) => {
    const raw = process.env[name];
    const value =
      raw === undefined ? fallback : /^\d+$/.test(raw) ? Number(raw) : NaN;
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum)
      throw new DomainError(`Invalid ${name} reporting budget.`);
    return value;
  };
  return {
    sourceRows: setting("REPORT_MAX_SOURCE_ROWS", 100000, 1, 1000000),
    timeoutMs: setting("REPORT_TIMEOUT_MS", 30000, 1000, 300000),
    exportBytes: setting(
      "REPORT_MAX_EXPORT_BYTES",
      67108864,
      1048576,
      268435456,
    ),
  };
}

export async function createReportWorkspace(
  tx: Transaction,
  signal?: AbortSignal,
) {
  if (signal?.aborted) throw new DomainError("Report cancelled.");
  const budget = reportBudgets();
  const deadline = performance.now() + budget.timeoutMs;
  await tx.execute(sql`SET LOCAL work_mem = '4MB'`);
  await tx.execute(sql`SET LOCAL maintenance_work_mem = '4MB'`);
  const table = sql.identifier(`report_${randomUUID().replaceAll("-", "")}`);
  await tx.execute(sql`CREATE TEMP TABLE ${table} (
    id text PRIMARY KEY, date text NOT NULL, kind text NOT NULL, "orderId" text,
    method text NOT NULL, "netCents" bigint NOT NULL, "taxCents" bigint NOT NULL,
    "collectionCents" bigint NOT NULL, "payoutCents" bigint NOT NULL,
    "creditLiabilityDeltaCents" bigint NOT NULL, reason text NOT NULL
  ) ON COMMIT DROP`);
  const buffer: SalesReportRow[] = [];
  let sourceCount = 0;
  const checkTime = () => {
    if (signal?.aborted) throw new DomainError("Report cancelled.");
    if (performance.now() > deadline)
      throw new DomainError(
        "Report exceeded its time budget. Choose a smaller period.",
      );
  };
  async function flush() {
    if (!buffer.length) return;
    checkTime();
    const batch = buffer.splice(0);
    await tx.execute(sql`INSERT INTO ${table} SELECT * FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) AS r(
      id text, date text, kind text, "orderId" text, method text,
      "netCents" bigint, "taxCents" bigint, "collectionCents" bigint,
      "payoutCents" bigint, "creditLiabilityDeltaCents" bigint, reason text)`);
  }
  return {
    table,
    checkTime,
    async *source(query: SQL) {
      checkTime();
      for await (const row of databaseCursor(tx, query)) {
        checkTime();
        if (++sourceCount > budget.sourceRows)
          throw new DomainError(
            "Report exceeded its source-row budget. Choose a smaller period.",
          );
        yield row;
      }
      checkTime();
    },
    async append(row: SalesReportRow) {
      summarizeSalesReport([row]); // Validate minor-unit precision before persistence.
      buffer.push(row);
      if (buffer.length === 500) await flush();
    },
    async finish() {
      checkTime();
      await flush();
      await tx.execute(sql`CREATE INDEX ON ${table} (date, id)`);
      checkTime();
    },
  };
}

export function reportAmount(value: unknown) {
  if (
    typeof value !== "number" &&
    typeof value !== "bigint" &&
    !(typeof value === "string" && /^-?\d+$/.test(value))
  )
    throw new DomainError("Invalid report amount.");
  const amount = Number(value);
  if (!Number.isSafeInteger(amount))
    throw new DomainError("Report total exceeds supported precision.");
  return amount;
}
export function reportRow(row: Record<string, unknown>): SalesReportRow {
  return {
    id: String(row.id),
    date: String(row.date),
    kind: row.kind as SalesReportRow["kind"],
    orderId: row.orderId === null ? null : String(row.orderId),
    method: String(row.method),
    netCents: reportAmount(row.netCents),
    taxCents: reportAmount(row.taxCents),
    collectionCents: reportAmount(row.collectionCents),
    payoutCents: reportAmount(row.payoutCents),
    creditLiabilityDeltaCents: reportAmount(row.creditLiabilityDeltaCents),
    reason: String(row.reason),
  };
}

export async function summarizeWorkspace(tx: Transaction, table: SQLWrapper) {
  const [totals] = await tx.execute(sql`SELECT
    coalesce(sum("netCents"),0)::text AS "netSalesCents",
    coalesce(sum("taxCents"),0)::text AS "taxCents",
    coalesce(sum("netCents"+"taxCents"),0)::text AS "grossSalesCents",
    coalesce(sum("collectionCents"),0)::text AS "collectionsCents",
    coalesce(sum("payoutCents"),0)::text AS "customerPayoutsCents",
    coalesce(sum("creditLiabilityDeltaCents"),0)::text AS "creditLiabilityDeltaCents",
    (-coalesce(sum("netCents"+"taxCents") FILTER(WHERE kind='refund'),0))::text AS "refundsAuthorizedCents",
    coalesce(sum("netCents") FILTER(WHERE kind='outside_adjustment'),0)::text AS "outsideNetSalesCents"
    FROM ${table}`);
  return {
    netSalesCents: reportAmount(totals!.netSalesCents),
    taxCents: reportAmount(totals!.taxCents),
    grossSalesCents: reportAmount(totals!.grossSalesCents),
    collectionsCents: reportAmount(totals!.collectionsCents),
    customerPayoutsCents: reportAmount(totals!.customerPayoutsCents),
    creditLiabilityDeltaCents: reportAmount(totals!.creditLiabilityDeltaCents),
    refundsAuthorizedCents: reportAmount(totals!.refundsAuthorizedCents),
    outsideNetSalesCents: reportAmount(totals!.outsideNetSalesCents),
  };
}
