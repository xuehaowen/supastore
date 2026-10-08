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

export default async function ActivityPage() {
  const staff = await staffIdentity().catch(() => redirect("/admin/login"));
  const data = await db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, staff, "owner");
    return {
      audits: await tx
        .select()
        .from(auditRecords)
        .orderBy(desc(auditRecords.createdAt))
        .limit(100),
      operations: await tx
        .select()
        .from(operationRequests)
        .orderBy(desc(operationRequests.createdAt))
        .limit(50),
      deliveries: await tx
        .select()
        .from(eventDeliveries)
        .orderBy(desc(eventDeliveries.createdAt))
        .limit(50),
    };
  });
  return (
    <main className="admin">
      <AdminNav />
      <p className="eyebrow">SYSTEM HISTORY</p>
      <h1>Activity</h1>
      <p className="admin-description">
        Recent audit records, idempotent operations, and notification delivery
        status.
      </p>
      <section className="panel">
        <h2>Audit log</h2>
        {data.audits.map((item) => (
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
              {item.createdAt.toLocaleString("en-US", { timeZone: "UTC" })} UTC
            </time>
          </article>
        ))}
        {!data.audits.length && (
          <p className="admin-empty">No audit records.</p>
        )}
      </section>
      <div className="admin-grid">
        <section className="panel">
          <h2>Operation requests</h2>
          {data.operations.map((item) => (
            <article className="translation-row" key={item.id}>
              <span>
                <strong>{item.action}</strong>
                <small>{item.actorScope}</small>
              </span>
              <span>{item.status}</span>
            </article>
          ))}
        </section>
        <section className="panel">
          <h2>Notification deliveries</h2>
          {data.deliveries.map((item) => (
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
              </span>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
