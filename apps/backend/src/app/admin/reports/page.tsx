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
} from "@supastore/ui/table";
import { Button } from "@supastore/ui/button";
import { Input } from "@supastore/ui/input";
import { Alert, AlertDescription } from "@supastore/ui/alert";
import { QueuePagination, queuePage } from "@/app/admin/queue-pagination";
import { logger } from "@/infrastructure/security/logger";
import { CurrencyField } from "@/app/admin/currency-field";
export default async function Reports({
  searchParams,
}: {
  searchParams: Promise<{
    start?: string;
    end?: string;
    error?: string;
    saved?: string;
    page?: string;
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
      page: Math.min(10000, queuePage(query.page)),
    });
  } catch (error) {
    if (error instanceof DomainError) reportError = error.message;
    else
      logger
        .child({ actorId: staff })
        .error("Sales report generation failed", error);
  }
  const format = (amount: number) =>
    money(
      amount,
      report?.currency ?? store?.currency ?? "USD",
      report?.precision ?? store?.precision ?? 2,
    );
  return (
    <>
      <AdminNav />
      <main tabIndex={-1} id="admin-content" className="admin">
        <h1>Sales reports</h1>
        <p>
          Confirmed purchases across all payment methods, less authorized
          purchase refunds. Tax is separate. Collections include receipt
          corrections; payouts show actual customer settlements. Credit issuance
          changes liabilities and does not count as a sale. Outside adjustments
          are signed, auditable entries.
        </p>
        {query.error && (
          <Alert variant="destructive">
            <AlertDescription>{query.error}</AlertDescription>
          </Alert>
        )}
        {query.saved && (
          <Alert>
            <AlertDescription>Adjustment recorded.</AlertDescription>
          </Alert>
        )}
        <form method="get" className="admin-filter-bar report-period-filter">
          <label>
            From
            <Input
              name="start"
              type="date"
              defaultValue={query.start ?? fiscal.start}
              required
            />
          </label>
          <label>
            Until (exclusive)
            <Input
              name="end"
              type="date"
              defaultValue={query.end ?? nextDay}
              required
            />
          </label>
          <Button type="submit">Apply period</Button>
        </form>
        {report ? (
          <>
            <p>
              Timezone: {report.timezone}. Currency: {report.currency}. Fiscal
              start: {fiscal.start}.
            </p>
            <dl className="report-summary">
              {Object.entries(report.totals).map(([key, value]) => (
                <div key={key}>
                  <dt>
                    {key
                      .replace(/Cents$/, "")
                      .replace(/([A-Z])/g, " $1")
                      .replace(/^./, (letter) => letter.toUpperCase())}
                  </dt>
                  <dd>{format(value)}</dd>
                </div>
              ))}
              <div>
                <dt>Closing credit liability</dt>
                <dd>{format(report.closingCreditLiabilityCents)}</dd>
              </div>
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
                    <TableCell>
                      {row.orderId ? (
                        <Link href={`/admin/orders/${row.orderId}`}>
                          {row.kind.replaceAll("_", " ")}
                        </Link>
                      ) : (
                        row.kind.replaceAll("_", " ")
                      )}
                      {row.reason && <small>{row.reason}</small>}
                    </TableCell>
                    <TableCell>{row.method}</TableCell>
                    <TableCell>{format(row.netCents)}</TableCell>
                    <TableCell>{format(row.taxCents)}</TableCell>
                    <TableCell>{format(row.collectionCents)}</TableCell>
                    <TableCell>{format(row.payoutCents)}</TableCell>
                  </TableRow>
                ))}
                {!report.rows.length && (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="text-center text-muted-foreground"
                    >
                      No activity in this period.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            <p>
              {report.totalRows} report entries. Totals cover the complete
              period.
            </p>
            <QueuePagination
              query={{ start: report.start, end: report.endExclusive }}
              path="/admin/reports"
              parameter="page"
              page={report.page}
              hasNext={report.hasNext}
            />
          </>
        ) : (
          <Alert variant="destructive">
            <AlertDescription>{reportError}</AlertDescription>
          </Alert>
        )}
        {identity.role === "owner" && (
          <form action={adjustOutsideSales} className="panel">
            <h2>Record outside sales adjustment</h2>
            <input type="hidden" name="requestKey" value={randomUUID()} />
            <label>
              Sale date
              <Input
                type="date"
                name="saleDate"
                defaultValue={today}
                required
              />
            </label>
            <CurrencyField
              label="Net sales"
              name="netCents"
              signed
              currency={store?.currency ?? "USD"}
              precision={store?.precision ?? 2}
            />
            <CurrencyField
              label="Tax"
              name="taxCents"
              value={0}
              signed
              currency={store?.currency ?? "USD"}
              precision={store?.precision ?? 2}
            />
            <label>
              Reason
              <Input name="reason" maxLength={500} required />
            </label>
            <Button type="submit">Record adjustment</Button>
            <p>
              Use a negative entry to correct an earlier adjustment; history is
              retained.
            </p>
          </form>
        )}
      </main>
    </>
  );
}
