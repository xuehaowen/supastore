import { redirect } from "next/navigation";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  orders,
  paymentAccounts,
  paymentUploadIntents,
  eventDeliveries,
  storeSettings,
} from "@/infrastructure/db/schema";
import { staffIdentity, money } from "@/infrastructure/web";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { getLaunchReadiness } from "@/application/use-cases/store/get-launch-readiness";
import {
  togglePause,
  proposeChange,
  receivePayment,
  confirmPayment,
} from "@/app/actions";
import { Field, Hidden, Notice, AdminNav } from "@/app/components";
export default async function Admin({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const staff = await staffIdentity().catch(() => redirect("/admin/login"));
  const data = await db
    .transaction(async (tx) => {
      const member = await verifyStaffInTransaction(tx, staff);
      const rows = await tx
        .select()
        .from(orders)
        .orderBy(desc(orders.createdAt))
        .limit(100);
      const accounts = await tx.select().from(paymentAccounts);
      const evidence = await tx
        .select()
        .from(paymentUploadIntents)
        .where(eq(paymentUploadIntents.status, "finalized"));
      const failures = await tx
        .select()
        .from(eventDeliveries)
        .where(inArray(eventDeliveries.status, ["retrying", "exhausted"]));
      const [store] = await tx.select().from(storeSettings).limit(1);
      return {
        member,
        rows,
        accounts,
        evidence,
        failures,
        store,
        readiness: await getLaunchReadiness(tx),
      };
    })
    .catch(() => redirect("/admin/setup"));
  const { member, rows, accounts, evidence, failures, store, readiness } = data;
  return (
    <main className="admin">
      <AdminNav />
      <p className="eyebrow">YOUR STORE, TODAY</p>
      <h1>Daily queue</h1>
      <Notice error={(await searchParams).error} />
      <div className="metrics">
        <a href="#unpaid">
          <strong>
            {rows.filter((o) => o.lifecycleStatus === "unpaid").length}
          </strong>
          Unpaid orders
        </a>
        <a href="#evidence">
          <strong>{evidence.length}</strong>Evidence review
        </a>
        <a href="#ready">
          <strong>
            {rows.filter((o) => o.lifecycleStatus === "confirmed").length}
          </strong>
          Ready for fulfillment
        </a>
        <a href="#emails">
          <strong>{failures.length}</strong>Failed emails
        </a>
      </div>
      {member.role === "owner" && (
        <section className="panel">
          <h2>Launch checklist</h2>
          <ul>
            {readiness.checklist.map((c) => (
              <li key={c.key}>
                {c.isReady ? "✓" : "○"} {c.label}
              </li>
            ))}
          </ul>
          <p>
            Synthetic demonstration only. Live use requires M2 and M3
            verification.
          </p>
          <form action={togglePause}>
            <Hidden name="paused" value={String(!store?.isPaused)} />
            <Field
              label="Pause message"
              name="message"
              value={store?.pauseMessage}
            />
            <button>
              {store?.isPaused ? "Resume new orders" : "Pause new orders"}
            </button>
          </form>
        </section>
      )}
      <section id="unpaid">
        <h2>Unpaid orders</h2>
        {rows
          .filter((o) => o.lifecycleStatus === "unpaid")
          .map((order) => (
            <details className="panel" key={order.id}>
              <summary>
                {order.referenceCode} · {order.guestName} ·{" "}
                {money(
                  order.purchaseTotalCents,
                  store?.currency,
                  store?.precision,
                )}
              </summary>
              <p>{order.guestEmail}</p>
              <form action={receivePayment}>
                <Hidden name="orderId" value={order.id} />
                <label>
                  Actual receiving account
                  <select name="accountId">
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.accountName} — {a.accountIdentifier}
                      </option>
                    ))}
                  </select>
                </label>
                <Field
                  name="amount"
                  label="Received amount (minor units)"
                  type="number"
                />
                <Field name="reference" label="Actual bank / cash reference" />
                <label className="check">
                  <input type="checkbox" name="verified" required />I verified
                  this receiving account and amount against the actual
                  transaction.
                </label>
                <button>Record receipt</button>
              </form>
              <form action={confirmPayment}>
                <Hidden name="orderId" value={order.id} />
                <button className="secondary">Confirm exact payment</button>
              </form>
              {member.role === "owner" && (
                <form action={proposeChange}>
                  <Hidden name="orderId" value={order.id} />
                  <Field
                    label="Proposed total (minor units)"
                    name="total"
                    type="number"
                  />
                  <Field label="Reason" name="reason" />
                  <button className="secondary">Propose new terms</button>
                </form>
              )}
            </details>
          ))}
      </section>
      <section id="evidence">
        <h2>Payment evidence review</h2>
        {evidence.map((e) => (
          <p key={e.id}>
            <a href={"/api/evidence/" + e.id}>Review image ↗</a> ·{" "}
            {rows.find((o) => o.id === e.orderId)?.referenceCode}
          </p>
        ))}
      </section>
      <section id="ready">
        <h2>Ready for fulfillment</h2>
        {rows
          .filter((o) => o.lifecycleStatus === "confirmed")
          .map((o) => (
            <p key={o.id}>
              {o.referenceCode} · {o.guestName} · {o.fulfillmentType}
            </p>
          ))}
      </section>
      <section>
        <h2>Overdue / abandoned review</h2>
        {rows
          .filter(
            (o) =>
              o.lifecycleStatus === "unpaid" &&
              o.createdAt.getTime() < Date.now() - 86400000,
          )
          .map((o) => (
            <p key={o.id}>
              {o.referenceCode} · Contact customer before resolving.
            </p>
          ))}
      </section>
      <section id="emails">
        <h2>Failed emails</h2>
        {failures.map((f) => (
          <p key={f.id}>
            {f.recipient} · {f.status} · {f.attempts} attempts
          </p>
        ))}
      </section>
    </main>
  );
}
