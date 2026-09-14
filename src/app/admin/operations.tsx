import { redirect } from "next/navigation";
import { and, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  orders,
  paymentAccounts,
  paymentUploadIntents,
  paymentReceipts,
  payoutAllocations,
  payoutAttempts,
  payoutDiscrepancies,
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
  fulfillConfirmedOrder,
  markOrderReady,
  completeOrderPickup,
  cancelAdminOrder,
  authorizeOrderRefund,
  authorizeOrderSurplusReturn,
  receiveCashPayment,
  correctRecordedReceipt,
  correctOrderFulfillment,
  claimOrderPayout,
  reconcileOrderPayout,
  resolveOrderPayoutDiscrepancy,
  closeOrderPayoutAttempt,
} from "@/app/actions";
import { Field, Hidden, Notice, AdminNav } from "@/app/components";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { Download } from "lucide-react";
export default async function Admin({
  searchParams,
  view = "overview",
}: {
  searchParams: Promise<{
    error?: string;
    q?: string;
    status?: string;
    page?: string;
  }>;
  view?: "overview" | "orders" | "payments" | "fulfillment";
}) {
  const query = await searchParams;
  const search = query.q?.trim().slice(0, 120) ?? "";
  const status = ["unpaid", "confirmed", "completed", "cancelled"].includes(
    query.status ?? "",
  )
    ? query.status!
    : "";
  const page = Math.max(
    1,
    Math.min(1000, Number.parseInt(query.page ?? "1", 10) || 1),
  );
  const staff = await staffIdentity().catch(() =>
    redirect("/admin/login?error=sign-in"),
  );
  const data = await db
    .transaction(async (tx) => {
      const member = await verifyStaffInTransaction(tx, staff);
      const orderFilters =
        view === "orders"
          ? [
              ...(status
                ? [
                    eq(
                      orders.lifecycleStatus,
                      status as
                        "unpaid" | "confirmed" | "completed" | "cancelled",
                    ),
                  ]
                : []),
              ...(search
                ? [
                    or(
                      ilike(orders.referenceCode, `%${search}%`),
                      ilike(orders.guestName, `%${search}%`),
                      ilike(orders.guestEmail, `%${search}%`),
                    )!,
                  ]
                : []),
            ]
          : [];
      const rows = await tx
        .select()
        .from(orders)
        .where(orderFilters.length ? and(...orderFilters) : undefined)
        .orderBy(desc(orders.createdAt))
        .limit(view === "orders" ? 51 : 100)
        .offset(view === "orders" ? (page - 1) * 50 : 0);
      const accounts = await tx.select().from(paymentAccounts);
      const receipts = await tx.select().from(paymentReceipts);
      const allocations = await tx.select().from(payoutAllocations);
      const attempts = await tx.select().from(payoutAttempts);
      const discrepancies = await tx.select().from(payoutDiscrepancies);
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
        receipts,
        allocations,
        attempts,
        discrepancies,
        evidence,
        failures,
        store,
        readiness: await getLaunchReadiness(tx),
      };
    })
    .catch(() => redirect("/admin/login?error=staff"));
  const {
    member,
    rows,
    accounts,
    receipts,
    allocations,
    attempts,
    discrepancies,
    evidence,
    failures,
    store,
    readiness,
  } = data;
  return (
    <main className="admin">
      <AdminNav />
      <p className="eyebrow">OPERATIONS OVERVIEW</p>
      <h1>
        {view === "overview"
          ? "Daily queue"
          : view === "orders"
            ? "Orders"
            : view === "payments"
              ? "Payments"
              : "Fulfillment"}
      </h1>
      <p className="admin-description">
        Track payments, review orders, and keep fulfillment moving. Order counts
        reflect the latest 100 orders.
      </p>
      {view === "orders" && member.role === "owner" && (
        <div className="admin-page-actions">
          <a
            href="/api/admin/exports/orders"
            download
            className={buttonVariants({ variant: "outline" })}
          >
            <Download aria-hidden="true" />
            Export orders CSV
          </a>
        </div>
      )}
      <Notice error={query.error} />
      {view === "orders" && (
        <form method="get" className="admin-filter-bar">
          <label>
            Search orders
            <Input
              name="q"
              defaultValue={search}
              placeholder="Reference, customer, or email"
            />
          </label>
          <label>
            Status
            <NativeSelect name="status" defaultValue={status}>
              <option value="">All statuses</option>
              <option value="unpaid">Unpaid</option>
              <option value="confirmed">Confirmed</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </NativeSelect>
          </label>
          <Button type="submit">Filter</Button>
        </form>
      )}
      <div className="metrics">
        <a href="/admin/orders#unpaid">
          <strong>
            {rows.filter((o) => o.lifecycleStatus === "unpaid").length}
          </strong>
          Unpaid orders
        </a>
        <a href="/admin/payments#evidence">
          <strong>{evidence.length}</strong>Evidence review
        </a>
        <a href="/admin/fulfillment#ready">
          <strong>
            {rows.filter((o) => o.lifecycleStatus === "confirmed").length}
          </strong>
          Ready for fulfillment
        </a>
        <a href="/admin#emails">
          <strong>{failures.length}</strong>Failed emails
        </a>
      </div>
      {view === "orders" && (
        <section className="panel">
          <h2>Order index</h2>
          {rows.slice(0, 50).map((order) => (
            <article className="admin-index-row" key={order.id}>
              <span>
                <strong>{order.referenceCode}</strong>
                <small>
                  {order.guestName} · {order.guestEmail}
                </small>
              </span>
              <span>{order.lifecycleStatus}</span>
              <span>
                {money(
                  order.purchaseTotalCents,
                  store?.currency,
                  store?.precision,
                )}
              </span>
              <time dateTime={order.createdAt.toISOString()}>
                {order.createdAt.toLocaleDateString("en-US", {
                  timeZone: "UTC",
                })}
              </time>
            </article>
          ))}
          {rows.length === 0 && (
            <p className="admin-empty">No orders match these filters.</p>
          )}
          <nav className="admin-pagination" aria-label="Order pages">
            {page > 1 && (
              <a
                href={`/admin/orders?q=${encodeURIComponent(search)}&status=${status}&page=${page - 1}`}
              >
                ← Previous
              </a>
            )}
            {rows.length > 50 && (
              <a
                href={`/admin/orders?q=${encodeURIComponent(search)}&status=${status}&page=${page + 1}`}
              >
                Next →
              </a>
            )}
          </nav>
        </section>
      )}
      {view === "payments" && (
        <section className="panel">
          <h2>Receipt ledger</h2>
          {receipts.map((receipt) => (
            <article className="admin-index-row" key={receipt.id}>
              <span>
                <strong>{receipt.normalizedReference}</strong>
                <small>
                  {rows.find((order) => order.id === receipt.orderId)
                    ?.referenceCode ?? receipt.orderId}
                </small>
              </span>
              <span>
                {money(receipt.amountCents, store?.currency, store?.precision)}
              </span>
              <time dateTime={receipt.createdAt.toISOString()}>
                {receipt.createdAt.toLocaleDateString("en-US", {
                  timeZone: "UTC",
                })}
              </time>
            </article>
          ))}
          {receipts.length === 0 && (
            <p className="admin-empty">No receipts recorded.</p>
          )}
        </section>
      )}
      {view === "overview" && member.role === "owner" && (
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
            <Hidden
              name="returnTo"
              value={view === "overview" ? "/admin" : `/admin/${view}`}
            />
            <Hidden name="paused" value={String(!store?.isPaused)} />
            <Field
              label="Pause message"
              name="message"
              value={store?.pauseMessage}
            />
            <Button type="submit">
              {store?.isPaused ? "Resume new orders" : "Pause new orders"}
            </Button>
          </form>
        </section>
      )}
      {view !== "fulfillment" && (
        <section id="unpaid">
          <h2>Unpaid orders and late receipts</h2>
          {!rows.some(
            (order) =>
              order.lifecycleStatus === "unpaid" ||
              order.lifecycleStatus === "cancelled",
          ) && (
            <p className="admin-empty">
              No unpaid orders or late receipts to review.
            </p>
          )}
          {rows
            .filter(
              (o) =>
                o.lifecycleStatus === "unpaid" ||
                o.lifecycleStatus === "cancelled",
            )
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
                {order.lifecycleStatus === "cancelled" && (
                  <p>
                    Cancelled — record late payments for return. Recording a
                    receipt does not reopen the order.
                  </p>
                )}
                <form action={receivePayment}>
                  <Hidden
                    name="returnTo"
                    value={view === "overview" ? "/admin" : `/admin/${view}`}
                  />
                  <Hidden name="orderId" value={order.id} />
                  <label>
                    Actual receiving account
                    <NativeSelect name="accountId">
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.accountName} — {a.accountIdentifier}
                        </option>
                      ))}
                    </NativeSelect>
                  </label>
                  <Field
                    name="amount"
                    label="Received amount (minor units)"
                    type="number"
                  />
                  <Field
                    name="reference"
                    label="Actual bank / cash reference"
                  />
                  <label className="check">
                    <Checkbox name="verified" required />I verified this
                    receiving account and amount against the actual transaction.
                  </label>
                  <Button type="submit">Record receipt</Button>
                </form>
                {order.lifecycleStatus === "unpaid" && (
                  <form action={confirmPayment}>
                    <Hidden
                      name="returnTo"
                      value={view === "overview" ? "/admin" : `/admin/${view}`}
                    />
                    <Hidden name="orderId" value={order.id} />
                    <Button type="submit" variant="outline">
                      Confirm exact payment
                    </Button>
                  </form>
                )}
                {member.role === "owner" &&
                  order.lifecycleStatus === "unpaid" && (
                    <form action={proposeChange}>
                      <Hidden
                        name="returnTo"
                        value={
                          view === "overview" ? "/admin" : `/admin/${view}`
                        }
                      />
                      <Hidden name="orderId" value={order.id} />
                      <Field
                        label="Proposed total (minor units)"
                        name="total"
                        type="number"
                      />
                      <Field label="Reason" name="reason" />
                      <Button type="submit" variant="outline">
                        Propose new terms
                      </Button>
                    </form>
                  )}
                {member.role === "owner" &&
                  order.lifecycleStatus === "unpaid" && (
                    <form action={cancelAdminOrder}>
                      <Hidden
                        name="returnTo"
                        value={
                          view === "overview" ? "/admin" : `/admin/${view}`
                        }
                      />
                      <Hidden name="orderId" value={order.id} />
                      <Field label="Cancellation reason" name="reason" />
                      <Button type="submit" variant="outline">
                        Cancel order
                      </Button>
                    </form>
                  )}
                <form action={receiveCashPayment} className="mt-4">
                  <Hidden
                    name="returnTo"
                    value={view === "overview" ? "/admin" : `/admin/${view}`}
                  />
                  <Hidden name="orderId" value={order.id} />
                  <label>
                    Cash account
                    <NativeSelect name="accountId">
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.accountName}
                        </option>
                      ))}
                    </NativeSelect>
                  </label>
                  <Field
                    name="amount"
                    label="Cash amount (minor units)"
                    type="number"
                  />
                  <Field
                    name="tenderedAmount"
                    label="Tendered amount (minor units)"
                    type="number"
                  />
                  <Field name="payerName" label="Payer name" />
                  <Button type="submit" variant="outline">
                    Record cash receipt
                  </Button>
                </form>
              </details>
            ))}
        </section>
      )}
      {(view === "overview" || view === "payments") && (
        <section id="evidence">
          <h2>Payment evidence review</h2>
          {evidence.length === 0 && (
            <p className="admin-empty">No payment evidence awaiting review.</p>
          )}
          {evidence.map((e) => (
            <p key={e.id}>
              <a href={"/api/evidence/" + e.id}>Review image ↗</a> ·{" "}
              {rows.find((o) => o.id === e.orderId)?.referenceCode}
            </p>
          ))}
        </section>
      )}
      {view !== "orders" && (
        <section id="ready">
          <h2>Fulfillment and payment operations</h2>
          {!rows.some(
            (order) =>
              order.lifecycleStatus === "confirmed" ||
              (member.role === "owner" &&
                receipts.some((receipt) => receipt.orderId === order.id)),
          ) && (
            <p className="admin-empty">
              No fulfillment or payment operations to review.
            </p>
          )}
          {rows
            .filter(
              (o) =>
                o.lifecycleStatus === "confirmed" ||
                (member.role === "owner" &&
                  receipts.some((receipt) => receipt.orderId === o.id)),
            )
            .map((o) => (
              <details className="panel" key={o.id}>
                <summary>
                  {o.referenceCode} · {o.guestName} · {o.fulfillmentType}
                </summary>
                <p>{o.guestEmail}</p>
                {o.lifecycleStatus === "confirmed" &&
                  (o.fulfillmentType === "pickup" ? (
                    <>
                      <form action={markOrderReady} className="mt-2">
                        <Hidden
                          name="returnTo"
                          value={
                            view === "overview" ? "/admin" : `/admin/${view}`
                          }
                        />
                        <Hidden name="orderId" value={o.id} />
                        <Button type="submit" variant="outline">
                          Mark ready for pickup
                        </Button>
                      </form>
                      <form action={completeOrderPickup} className="mt-2">
                        <Hidden
                          name="returnTo"
                          value={
                            view === "overview" ? "/admin" : `/admin/${view}`
                          }
                        />
                        <Hidden name="orderId" value={o.id} />
                        <Field
                          label="Recipient / authorized recipient"
                          name="handoffActor"
                        />
                        <NativeSelect
                          name="verificationMethod"
                          defaultValue="scoped_order_page"
                        >
                          <option value="scoped_order_page">
                            Scoped order page
                          </option>
                          <option value="owner_assisted">
                            Owner-assisted verification
                          </option>
                        </NativeSelect>
                        <Button type="submit" variant="outline">
                          Complete pickup handoff
                        </Button>
                      </form>
                    </>
                  ) : (
                    <form action={fulfillConfirmedOrder} className="mt-2">
                      <Hidden
                        name="returnTo"
                        value={
                          view === "overview" ? "/admin" : `/admin/${view}`
                        }
                      />
                      <Hidden name="orderId" value={o.id} />
                      <Field label="Carrier" name="carrier" />
                      <Field label="Tracking number" name="trackingNumber" />
                      <Button type="submit" variant="outline">
                        Mark shipped / delivered
                      </Button>
                    </form>
                  ))}
                {member.role === "owner" &&
                  o.lifecycleStatus === "confirmed" && (
                    <form action={cancelAdminOrder} className="mt-2">
                      <Hidden
                        name="returnTo"
                        value={
                          view === "overview" ? "/admin" : `/admin/${view}`
                        }
                      />
                      <Hidden name="orderId" value={o.id} />
                      <Field label="Cancellation reason" name="reason" />
                      <Button type="submit" variant="outline">
                        Cancel order
                      </Button>
                    </form>
                  )}
                {member.role === "owner" &&
                  receipts
                    .filter((receipt) => receipt.orderId === o.id)
                    .map((receipt) => (
                      <div className="mt-4 border-t pt-4" key={receipt.id}>
                        <p>
                          Receipt: {receipt.normalizedReference} ·{" "}
                          {receipt.amountCents} minor units
                        </p>
                        {(o.lifecycleStatus === "confirmed" ||
                          o.lifecycleStatus === "completed") && (
                          <form action={authorizeOrderRefund} className="mt-2">
                            <Hidden
                              name="returnTo"
                              value={
                                view === "overview"
                                  ? "/admin"
                                  : `/admin/${view}`
                              }
                            />
                            <Hidden name="orderId" value={o.id} />
                            <Hidden name="receiptId" value={receipt.id} />
                            <Field
                              label="Refund amount (minor units)"
                              name="amount"
                              type="number"
                            />
                            <Field label="Refund reason" name="reason" />
                            <Button type="submit" variant="outline">
                              Authorize refund
                            </Button>
                          </form>
                        )}
                        <form
                          action={authorizeOrderSurplusReturn}
                          className="mt-2"
                        >
                          <Hidden
                            name="returnTo"
                            value={
                              view === "overview" ? "/admin" : `/admin/${view}`
                            }
                          />
                          <Hidden name="orderId" value={o.id} />
                          <Hidden name="receiptId" value={receipt.id} />
                          <Field
                            label="Surplus return amount (minor units)"
                            name="amount"
                            type="number"
                          />
                          <Field label="Return reason" name="reason" />
                          <Button type="submit" variant="outline">
                            Authorize surplus return
                          </Button>
                        </form>
                        <form action={correctRecordedReceipt} className="mt-2">
                          <Hidden
                            name="returnTo"
                            value={
                              view === "overview" ? "/admin" : `/admin/${view}`
                            }
                          />
                          <Hidden name="receiptId" value={receipt.id} />
                          <Field
                            label="Correction delta (minor units)"
                            name="delta"
                            type="number"
                          />
                          <Field label="Correction reason" name="reason" />
                          <Field label="Investigation notes" name="notes" />
                          <Button type="submit" variant="outline">
                            Open receipt correction
                          </Button>
                        </form>
                      </div>
                    ))}
                <form action={correctOrderFulfillment} className="mt-2">
                  <Hidden
                    name="returnTo"
                    value={view === "overview" ? "/admin" : `/admin/${view}`}
                  />
                  <Hidden name="orderId" value={o.id} />
                  <Field
                    label="Corrected carrier / delivery method"
                    name="carrier"
                  />
                  <Field
                    label="Corrected tracking number"
                    name="trackingNumber"
                  />
                  <Field label="Correction reason" name="reason" />
                  <Button type="submit" variant="outline">
                    Correct fulfillment details
                  </Button>
                </form>
              </details>
            ))}
        </section>
      )}
      {(view === "overview" || view === "orders") && (
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
      )}
      {view === "overview" && (
        <section id="emails">
          <h2>Failed emails</h2>
          {failures.length === 0 && (
            <p className="admin-empty">
              No failed email deliveries. You're all caught up.
            </p>
          )}
          {failures.map((f) => (
            <p key={f.id}>
              {f.recipient} · {f.status} · {f.attempts} attempts
            </p>
          ))}
        </section>
      )}
      {(view === "overview" || view === "payments") &&
        member.role === "owner" && (
          <section id="payouts">
            <h2>Payouts and discrepancies</h2>
            {allocations.map((allocation) => {
              const attempt = attempts.find(
                (item) => item.allocationId === allocation.id,
              );
              const discrepancy = attempt
                ? discrepancies.find(
                    (item) =>
                      item.payoutAttemptId === attempt.id &&
                      item.status === "open",
                  )
                : undefined;
              return (
                <details className="panel" key={allocation.id}>
                  <summary>
                    Payout allocation {allocation.id} ·{" "}
                    {allocation.authorizedAmountCents} minor units
                  </summary>
                  {!attempt ? (
                    <form action={claimOrderPayout} className="mt-2">
                      <Hidden
                        name="returnTo"
                        value={
                          view === "overview" ? "/admin" : `/admin/${view}`
                        }
                      />
                      <Hidden name="allocationId" value={allocation.id} />
                      <Field
                        label="Claim amount (minor units)"
                        name="amount"
                        type="number"
                      />
                      <NativeSelect
                        name="destinationType"
                        defaultValue="bank_account"
                      >
                        <option value="bank_account">Bank account</option>
                        <option value="card">Card</option>
                        <option value="cash">Cash</option>
                      </NativeSelect>
                      <Field
                        label="Verified return destination"
                        name="destination"
                      />
                      <Button type="submit" variant="outline">
                        Claim payout
                      </Button>
                    </form>
                  ) : (
                    <>
                      <p>
                        Attempt {attempt.id} · {attempt.status}
                      </p>
                      {attempt.status === "sending" && (
                        <form action={reconcileOrderPayout} className="mt-2">
                          <Hidden
                            name="returnTo"
                            value={
                              view === "overview" ? "/admin" : `/admin/${view}`
                            }
                          />
                          <Hidden name="attemptId" value={attempt.id} />
                          <Field
                            label="Actual payout amount (minor units)"
                            name="actualAmount"
                            type="number"
                          />
                          <Field
                            label="Transfer reference"
                            name="transferReference"
                          />
                          <NativeSelect
                            name="destinationType"
                            defaultValue="bank_account"
                          >
                            <option value="bank_account">Bank account</option>
                            <option value="card">Card</option>
                            <option value="cash">Cash</option>
                          </NativeSelect>
                          <Field
                            label="Actual destination"
                            name="destination"
                          />
                          <Button type="submit" variant="outline">
                            Reconcile payout
                          </Button>
                        </form>
                      )}
                      {discrepancy && (
                        <form
                          action={resolveOrderPayoutDiscrepancy}
                          className="mt-2"
                        >
                          <Hidden
                            name="returnTo"
                            value={
                              view === "overview" ? "/admin" : `/admin/${view}`
                            }
                          />
                          <Hidden name="discrepancyId" value={discrepancy.id} />
                          <Field
                            label="Write-off amount (minor units)"
                            name="writeOff"
                            type="number"
                          />
                          <Field label="Resolution reason" name="reason" />
                          <Button type="submit" variant="outline">
                            Resolve discrepancy
                          </Button>
                        </form>
                      )}
                      {!discrepancy && attempt.status !== "reconciled" && (
                        <form action={closeOrderPayoutAttempt} className="mt-2">
                          <Hidden
                            name="returnTo"
                            value={
                              view === "overview" ? "/admin" : `/admin/${view}`
                            }
                          />
                          <Hidden name="attemptId" value={attempt.id} />
                          <Field label="Closure reason" name="reason" />
                          <Button type="submit" variant="outline">
                            Close payout attempt
                          </Button>
                        </form>
                      )}
                    </>
                  )}
                </details>
              );
            })}
          </section>
        )}
    </main>
  );
}
