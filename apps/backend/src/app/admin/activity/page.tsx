import { desc } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/infrastructure/db";
import {
  auditRecords,
  eventDeliveries,
  operationRequests,
} from "@/infrastructure/db/schema";
import { staffIdentity } from "@/infrastructure/web";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { AdminNav } from "@/app/admin/admin-nav";
import { queuePage, QueuePagination } from "@/app/admin/queue-pagination";

const deliveryLabels: Record<string, string> = {
  pending: "Queued",
  retrying: "Retry scheduled",
  dispatching: "Sending",
  accepted: "Provider accepted · delivery unconfirmed",
  awaiting: "Awaiting delivery confirmation",
  sent: "Sent by provider",
  delivered: "Delivery confirmed",
  failed: "Delivery failed",
  review: "Review before retrying",
  suppressed: "Suppressed",
  exhausted: "Retry limit reached",
};

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{
    auditsPage?: string;
    operationsPage?: string;
    deliveriesPage?: string;
  }>;
}) {
  const query = await searchParams;
  const auditsPage = queuePage(query.auditsPage);
  const operationsPage = queuePage(query.operationsPage);
  const deliveriesPage = queuePage(query.deliveriesPage);
  const staff = await staffIdentity().catch(() => redirect("/admin/login"));
  const data = await db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, staff, "owner");
    return {
      audits: await tx
        .select()
        .from(auditRecords)
        .orderBy(desc(auditRecords.createdAt), desc(auditRecords.id))
        .limit(51)
        .offset((auditsPage - 1) * 50),
      operations: await tx
        .select()
        .from(operationRequests)
        .orderBy(desc(operationRequests.createdAt), desc(operationRequests.id))
        .limit(51)
        .offset((operationsPage - 1) * 50),
      deliveries: await tx
        .select()
        .from(eventDeliveries)
        .orderBy(desc(eventDeliveries.createdAt), desc(eventDeliveries.id))
        .limit(51)
        .offset((deliveriesPage - 1) * 50),
    };
  });
  return (
    <>
      <AdminNav />
      <main tabIndex={-1} id="admin-content" className="admin">
        <p className="eyebrow">SYSTEM HISTORY</p>
        <h1>Activity</h1>
        <p className="admin-description">
          Recent audit records, idempotent operations, and notification delivery
          status.
        </p>
        <section className="panel">
          <h2>Audit log</h2>
          {data.audits.slice(0, 50).map((item) => (
            <article className="admin-index-row" key={item.id}>
              <span>
                <strong>{item.action}</strong>
                <small>
                  {item.entityType} · {item.entityId}
                </small>
              </span>
              <span>{item.actorId}</span>
              <span>{item.reason || "—"}</span>
              <time dateTime={item.createdAt.toISOString()}>
                {item.createdAt.toLocaleString("en-US", { timeZone: "UTC" })}{" "}
                UTC
              </time>
            </article>
          ))}
          {!data.audits.length && (
            <p className="admin-empty">No audit records.</p>
          )}
          <QueuePagination
            query={query}
            path="/admin/activity"
            parameter="auditsPage"
            page={auditsPage}
            hasNext={data.audits.length > 50}
          />
        </section>
        <div className="admin-grid">
          <section className="panel">
            <h2>Operation requests</h2>
            {!data.operations.length && (
              <p className="admin-empty">No operation requests recorded.</p>
            )}
            {data.operations.slice(0, 50).map((item) => (
              <article className="translation-row" key={item.id}>
                <span>
                  <strong>{item.action}</strong>
                  <small>{item.actorScope}</small>
                </span>
                <span>{item.status}</span>
              </article>
            ))}
            <QueuePagination
              query={query}
              path="/admin/activity"
              parameter="operationsPage"
              page={operationsPage}
              hasNext={data.operations.length > 50}
            />
          </section>
          <section className="panel">
            <h2>Notification deliveries</h2>
            {!data.deliveries.length && (
              <p className="admin-empty">No notification deliveries yet.</p>
            )}
            {data.deliveries.slice(0, 50).map((item) => (
              <article className="translation-row" key={item.id}>
                <span>
                  <strong>{item.recipient}</strong>
                  <small>
                    {item.channel} · {item.attempts} attempts
                  </small>
                </span>
                <span>
                  {item.providerStatus === "legacy_success_unverified"
                    ? "Legacy send acknowledged · delivery unconfirmed"
                    : (deliveryLabels[item.status] ?? item.status)}
                  {item.failureCode && <small> · {item.failureCode}</small>}
                </span>
              </article>
            ))}
            <QueuePagination
              query={query}
              path="/admin/activity"
              parameter="deliveriesPage"
              page={deliveriesPage}
              hasNext={data.deliveries.length > 50}
            />
          </section>
        </div>
      </main>
    </>
  );
}
