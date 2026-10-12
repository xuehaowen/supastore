import { sql } from "drizzle-orm";
import type { Transaction } from "@/application/common/transaction";
import { localReportDate, offsetReportDate } from "@/domain/sales-report";
import { prepareSalesReport } from "@/application/use-cases/reports/sales-report";
import { reportAmount } from "@/application/use-cases/reports/report-workspace";

/** Same canonical rows as reports, using merchant calendar days and confirmation events. */
export async function getDashboardSales(
  tx: Transaction,
  timezone: string,
  now: Date,
) {
  const today = localReportDate(now, timezone);
  const report = await prepareSalesReport(
    tx,
    offsetReportDate(today, -29),
    offsetReportDate(today, 1),
  );
  const [sales] = await tx.execute(sql`SELECT count(*)::text AS count,
    coalesce(round(avg("netCents"+"taxCents")),0)::text AS average FROM ${report.table} WHERE kind='sale'`);
  const [units] =
    await tx.execute(sql`SELECT coalesce(sum(quantity),0)::text AS count FROM order_items
    WHERE EXISTS (SELECT 1 FROM ${report.table} r WHERE r.kind='sale' AND r."orderId"=order_items.order_id::text)`);
  const trend =
    await tx.execute(sql`SELECT date AS day, sum("netCents")::text AS revenue,
    count(*) FILTER(WHERE kind='sale')::text AS orders FROM ${report.table}
    WHERE date >= ${offsetReportDate(today, -6)} GROUP BY date ORDER BY date`);
  const byDay = new Map(
    trend.map((row) => [
      String(row.day),
      {
        day: String(row.day),
        revenueCents: reportAmount(row.revenue),
        orders: reportAmount(row.orders),
      },
    ]),
  );
  return {
    commerceSummary: {
      revenueCents: report.totals.netSalesCents,
      orderCount: reportAmount(sales!.count),
      averageOrderCents: reportAmount(sales!.average),
    },
    units: reportAmount(units!.count),
    salesTrend: Array.from({ length: 7 }, (_, index) => {
      const day = offsetReportDate(today, index - 6);
      return byDay.get(day) || { day, revenueCents: 0, orders: 0 };
    }),
  };
}
