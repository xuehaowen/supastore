export type SalesReportKind = "sale" | "refund" | "receipt" | "receipt_correction" | "payout" | "credit" | "outside_adjustment";
export interface SalesReportRow {
  id: string;
  date: string;
  kind: SalesReportKind;
  orderId: string | null;
  method: string;
  netCents: number;
  taxCents: number;
  collectionCents: number;
  payoutCents: number;
  creditLiabilityDeltaCents: number;
  reason: string;
}
export function reportDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ||
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) throw new Error("Use a valid YYYY-MM-DD reporting date");
  return value;
}
export function localReportDate(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit"}).formatToParts(date);
  const part = (type: string) => parts.find(item => item.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function fiscalReportPeriod(date: string, firstMonth: number) {
  reportDate(date);
  if (!Number.isInteger(firstMonth) || firstMonth < 1 || firstMonth > 12) throw new Error("Invalid fiscal start month");
  const year = Number(date.slice(0, 4)) - (Number(date.slice(5, 7)) < firstMonth ? 1 : 0);
  const month = String(firstMonth).padStart(2, "0");
  return {start: `${year}-${month}-01`, endExclusive: `${year + 1}-${month}-01`};
}
function sum(values: number[]) {
  const total = values.reduce((result, value) => {
    if (!Number.isSafeInteger(value)) throw new Error("Report amounts must be safe integer minor units");
    return result + BigInt(value);
  }, 0n);
  if (total > BigInt(Number.MAX_SAFE_INTEGER) || total < BigInt(Number.MIN_SAFE_INTEGER)) throw new Error("Report total exceeds supported precision");
  return Number(total);
}
export function summarizeSalesReport(rows: readonly SalesReportRow[]) {
  const ids = new Set<string>();
  for (const row of rows) {
    if (ids.has(row.id)) throw new Error("Duplicate financial report identity");
    ids.add(row.id);
  }
  const netSalesCents = sum(rows.map(row => row.netCents));
  const taxCents = sum(rows.map(row => row.taxCents));
  return {netSalesCents, taxCents, grossSalesCents: sum([netSalesCents, taxCents]),
    collectionsCents: sum(rows.map(row => row.collectionCents)),
    customerPayoutsCents: sum(rows.map(row => row.payoutCents)),
    creditLiabilityDeltaCents: sum(rows.map(row => row.creditLiabilityDeltaCents)),
    refundsAuthorizedCents: -sum(rows.filter(row => row.kind === "refund").map(row => row.netCents + row.taxCents)),
    outsideNetSalesCents: sum(rows.filter(row => row.kind === "outside_adjustment").map(row => row.netCents)),
  };
}
function csv(value: string | number | null) {
  let text = String(value ?? "");
  if (/^[=+@\-\t\r]/.test(text) && typeof value !== "number") text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function salesReportCsv(rows: readonly SalesReportRow[]) {
  const columns = ["id", "date", "kind", "orderId", "method", "netCents", "taxCents", "collectionCents", "payoutCents", "creditLiabilityDeltaCents", "reason"] as const;
  return [columns.join(","), ...rows.map(row => columns.map(column => csv(row[column])).join(","))].join("\r\n") + "\r\n";
}
