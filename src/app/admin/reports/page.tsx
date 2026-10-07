import { randomUUID } from "node:crypto";
import Link from "next/link";
import { db } from "@/infrastructure/db";
import { storeSettings } from "@/infrastructure/db/schema";
import { staffIdentity, money } from "@/infrastructure/web";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { generateSalesReport } from "@/application/use-cases/reports/sales-report";
import { fiscalReportPeriod, localReportDate } from "@/domain/sales-report";
import { commercePolicy } from "@/domain/commerce-policy";
import { AdminNav } from "@/app/admin/admin-nav";
import { adjustOutsideSales } from "./actions";
import { DomainError } from "@/application/common/errors";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
export default async function Reports({
  searchParams,
}: {
  searchParams: Promise<{
    start?: string;
    end?: string;
    error?: string;
    saved?: string;
  }>;
}) {
  const staff = await staffIdentity();
  const identity = await db.transaction((tx) =>
    verifyStaffInTransaction(tx, staff),
  );
  const [store] = await db.select().from(storeSettings).limit(1);
  const query = await searchParams;
  const policy = commercePolicy(store?.commercePolicy);
  const today = localReportDate(new Date(), store?.timezone ?? "UTC");
  const fiscal = fiscalReportPeriod(today, policy.fiscalYearStartMonth);
  const nextDay = new Date(Date.parse(`${today}T00:00:00Z`) + 86400000)
    .toISOString()
    .slice(0, 10);
  let report: Awaited<ReturnType<typeof generateSalesReport>> | undefined;
  let reportError = "Unable to generate this period. Check dates or retry.";
  try {
    report = await generateSalesReport({
      actorUserId: staff,
      start: query.start ?? fiscal.start,
      endExclusive: query.end ?? nextDay,
    });
  } catch (error) {
    if (error instanceof DomainError) reportError = error.message;
  }
  const format = (amount: number) =>
    money(
      amount,
      report?.currency ?? store?.currency ?? "USD",
      report?.precision ?? store?.precision ?? 2,
    );
  return (
    <main className="admin">
      <AdminNav />
      <h1>Sales reports</h1>
      <p>
        Confirmed purchases across all payment methods, less authorized purchase
        refunds. Tax is separate. Collections include receipt corrections;
        payouts show actual customer settlements. Credit issuance changes
        liabilities and does not count as a sale. Outside adjustments are
        signed, auditable entries.
      </p>
      {query.error && <p role="alert">{query.error}</p>}
      {query.saved && <p role="status">Adjustment recorded.</p>}
      <form method="get">
        <label>
          From
          <input
            name="start"
            type="date"
            defaultValue={query.start ?? fiscal.start}
            required
          />
        </label>
        <label>
          Until (exclusive)
          <input
            name="end"
            type="date"
            defaultValue={query.end ?? nextDay}
            required
          />
        </label>
        <button>Apply period</button>
      </form>
      {report ? (
        <>
          <p>
            Timezone: {report.timezone}. Currency: {report.currency}. Fiscal
            start: {fiscal.start}.
          </p>
          <dl>
            {Object.entries(report.totals).map(([key, value]) => (
              <div key={key}>
                <dt>{key.replace(/Cents$/, " ").replace(/([A-Z])/g, " $1")}</dt>
                <dd>{format(value)}</dd>
              </div>
            ))}
            <dt>Closing credit liability</dt>
            <dd>{format(report.closingCreditLiabilityCents)}</dd>
          </dl>
          {policy.salesThresholdCents && (
            <p>
              Annual net sales warning: {format(policy.salesThresholdCents)}.
              This is a merchant configured warning; ordering remains enabled.
            </p>
          )}
          <Link
            href={`/admin/reports/export?${new URLSearchParams({ start: report.start, end: report.endExclusive })}`}
          >
            Export CSV
          </Link>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Activity</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Net sales</TableHead>
                <TableHead>Tax</TableHead>
                <TableHead>Collections</TableHead>
                <TableHead>Payouts</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.date}</TableCell>
                  <TableCell>{row.kind}</TableCell>
                  <TableCell>{row.method}</TableCell>
                  <TableCell>{format(row.netCents)}</TableCell>
                  <TableCell>{format(row.taxCents)}</TableCell>
                  <TableCell>{format(row.collectionCents)}</TableCell>
                  <TableCell>{format(row.payoutCents)}</TableCell>
                </TableRow>
              ))}
              {!report.rows.length && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    No activity in this period.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </>
      ) : (
        <p role="alert">{reportError}</p>
      )}
      {identity.role === "owner" && (
        <form action={adjustOutsideSales} className="panel">
          <h2>Record outside sales adjustment</h2>
          <input type="hidden" name="requestKey" value={randomUUID()} />
          <label>
            Sale date
            <input type="date" name="saleDate" defaultValue={today} required />
          </label>
          <label>
            Net sales in minor units
            <input type="number" name="netCents" required />
          </label>
          <label>
            Tax in minor units
            <input type="number" name="taxCents" defaultValue="0" required />
          </label>
          <label>
            Reason
            <input name="reason" maxLength={500} required />
          </label>
          <button>Record adjustment</button>
          <p>
            Use a negative entry to correct an earlier adjustment; history is
            retained.
          </p>
        </form>
      )}
    </main>
  );
}
