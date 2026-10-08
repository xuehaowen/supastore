import { parseLedgerCursor, encodeLedgerCursor, ledgerTimestamp, ledgerBoundary } from "@/infrastructure/db/ledger-cursor";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { notFound, redirect } from "next/navigation";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  customers,
  storeCreditAccounts,
  storeCreditEntries,
  storeCreditReservations,
} from "@/infrastructure/db/schema";
import { staffIdentity, money } from "@/infrastructure/web";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { AdminNav } from "@/app/admin/admin-nav";
import { AdminDialog } from "@/app/admin/admin-dialog";
import { Field, Hidden, Notice } from "@/app/components";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { issueCreditAction } from "@/app/admin/credit-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
export default async function CreditDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ after?: string; saved?: string; error?: string }>;
}) {
  const staff = await staffIdentity().catch(() => redirect("/admin/login"));
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const query = await searchParams;
  const cursor = parseLedgerCursor(query.after);
  const data = await db.transaction(async (tx) => {
    const identity = await verifyStaffInTransaction(tx, staff);
    const [row] = await tx
      .select({ account: storeCreditAccounts, customer: customers })
      .from(storeCreditAccounts)
      .innerJoin(customers, eq(customers.id, storeCreditAccounts.customerId))
      .where(eq(storeCreditAccounts.id, id));
    if (!row) return null;
    const entries = await tx
      .select({
        entry: storeCreditEntries,
        cursorTimestamp: ledgerTimestamp(storeCreditEntries.createdAt),
        reversed: sql<boolean>`exists(select 1 from store_credit_entries r where r.reversal_of_id = ${sql`${storeCreditEntries.id}`})`,
      })
      .from(storeCreditEntries)
      .where(and(eq(storeCreditEntries.accountId, id), ledgerBoundary(storeCreditEntries.createdAt, storeCreditEntries.id, cursor)))
      .orderBy(desc(storeCreditEntries.createdAt), desc(storeCreditEntries.id))
      .limit(26);
    const [ledger] = await tx
      .select({
        total: sql<number>`coalesce(sum(${storeCreditEntries.amountCents}),0)::bigint`,
      })
      .from(storeCreditEntries)
      .where(eq(storeCreditEntries.accountId, id));
    const [holds] = await tx
      .select({
        total: sql<number>`coalesce(sum(${storeCreditReservations.amountCents}),0)::bigint`,
      })
      .from(storeCreditReservations)
      .where(
        and(
          eq(storeCreditReservations.accountId, id),
          eq(storeCreditReservations.status, "active"),
        ),
      );
    return {
      ...row,
      entries,
      owner: identity.role === "owner",
      reconciled:
        Number(ledger!.total) === row.account.balanceCents &&
        Number(holds!.total) === row.account.reservedCents,
    };
  });
  if (!data) notFound();
  const a = data.account,
    c = data.customer;
  return (
    <main className="admin">
      <AdminNav />
      <Link href="/admin/store-credit">← Store credit</Link>
      <h1>{c.name} · Credit ledger</h1>
      <p>{c.email}</p>
      <Notice error={query.error} />
      {query.saved && (
        <Alert>
          <AlertDescription>Credit entry posted.</AlertDescription>
        </Alert>
      )}
      <section className="panel">
        <h2>Balance</h2>
        <p>
          Available:{" "}
          {money(a.balanceCents - a.reservedCents, a.currency, a.precision)} ·
          Reserved: {money(a.reservedCents, a.currency, a.precision)}
        </p>
        <p>
          {data.reconciled
            ? "Ledger and reservations reconcile."
            : "Reconciliation drift · owner investigation required."}
        </p>
      </section>
      <section className="panel">
        <h2>Entries</h2>
        <a href={`/api/admin/store-credit/${id}/export`}>
          Export full ledger (CSV)
        </a>
        <Link href="/admin/reconciliation">Review reconciliation</Link>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Reason / reference</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.entries.slice(0, 25).map(({ entry: e, reversed }) => (
              <TableRow key={e.id}>
                <TableCell>
                  {e.createdAt.toLocaleString("en-US", { timeZone: "UTC" })} UTC
                </TableCell>
                <TableCell>{e.kind}</TableCell>
                <TableCell>
                  {money(e.amountCents, a.currency, a.precision)}
                </TableCell>
                <TableCell>
                  {e.reason}
                  {e.orderId && (
                    <p>
                      <Link href={`/admin/orders/${e.orderId}`}>
                        Linked order
                      </Link>
                    </p>
                  )}
                </TableCell>
                <TableCell>
                  {data.owner && e.kind === "issue" && !reversed && (
                    <AdminDialog
                      trigger="Reverse issuance"
                      title="Reverse original issuance"
                      description="Append a compensating entry for the full original amount. Spent or reserved credit cannot be reversed."
                    >
                      <form action={issueCreditAction}>
                        <Hidden name="customerId" value={c.id} />
                        <Hidden
                          name="amountCents"
                          value={String(e.amountCents)}
                        />
                        <Hidden name="reversalOfId" value={e.id} />
                        <Hidden name="requestKey" value={randomUUID()} />
                        <Field name="reason" label="Reversal reason" />
                        <Button type="submit">Post reversal</Button>
                      </form>
                    </AdminDialog>
                  )}
                  {reversed && "Reversed"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <nav className="pager" aria-label="Ledger pages">
          {cursor && <Link href="?">Latest entries</Link>}
          {data.entries.length > 25 && (
            <Link href={`?after=${encodeLedgerCursor(data.entries[24]!.cursorTimestamp, data.entries[24]!.entry.id)}`}>Older entries</Link>
          )}
        </nav>
      </section>
    </main>
  );
}
