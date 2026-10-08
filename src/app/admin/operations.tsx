import { redirect } from "next/navigation";
import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  orders,
  orderItems,
  paymentAccounts,
  paymentUploadIntents,
  paymentReceipts,
  payoutAllocations,
  payoutAttempts,
  payoutDiscrepancies,
  eventDeliveries,
  storeSettings,
  products,
  productVariants,
} from "@/infrastructure/db/schema";
import { staffIdentity, money } from "@/infrastructure/web";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { getLaunchReadiness } from "@/application/use-cases/store/get-launch-readiness";
import { ForbiddenError, UnauthorizedError } from "@/application/common/errors";
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
import { Field, Hidden, Notice } from "@/app/components";
import { AdminNav } from "@/app/admin/admin-nav";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { Download } from "lucide-react";
import { OperationsSummary } from "@/app/admin/operations-summary";
import { ManualOrderDialog } from "@/app/admin/manual-order-dialog";
import { AdminDialog } from "@/app/admin/admin-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
export default async function Admin({
  searchParams,
  view = "overview",
}: {
  searchParams: Promise<{
    error?: string;
    q?: string;
    status?: string;
    page?: string;
    created?: string;
    manage?: string;
    managePayment?: string;
    paymentQ?: string;
    paymentStatus?: string;
    paymentType?: string;
    paymentPage?: string;
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
  const paymentSearch = query.paymentQ?.trim().slice(0, 120) ?? "";
  const paymentStatus = [
    "unpaid",
    "confirmed",
    "completed",
    "cancelled",
  ].includes(query.paymentStatus ?? "")
    ? query.paymentStatus!
    : "";
  const paymentType = ["cash", "zelle", "venmo", "other"].includes(
    query.paymentType ?? "",
  )
    ? query.paymentType!
    : "";
  const paymentPage = Math.max(
    1,
    Math.min(1000, Number.parseInt(query.paymentPage ?? "1", 10) || 1),
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
      const paymentFilters = [
        ...(paymentStatus
          ? [
              eq(
                orders.lifecycleStatus,
                paymentStatus as
                  "unpaid" | "confirmed" | "completed" | "cancelled",
              ),
            ]
          : []),
        ...(paymentType
          ? [
              eq(
                paymentAccounts.accountType,
                paymentType as "cash" | "zelle" | "venmo" | "other",
              ),
            ]
          : []),
        ...(paymentSearch
          ? [
              or(
                ilike(orders.guestName, `%${paymentSearch}%`),
                ilike(orders.guestEmail, `%${paymentSearch}%`),
                ilike(orders.referenceCode, `%${paymentSearch}%`),
                ilike(
                  paymentReceipts.normalizedReference,
                  `%${paymentSearch}%`,
                ),
              )!,
            ]
          : []),
      ];
      const paymentRows =
        view === "payments"
          ? await tx
              .select({
                receipt: paymentReceipts,
                order: orders,
                account: paymentAccounts,
              })
              .from(paymentReceipts)
              .innerJoin(orders, eq(orders.id, paymentReceipts.orderId))
              .innerJoin(
                paymentAccounts,
                eq(paymentAccounts.id, paymentReceipts.paymentAccountId),
              )
              .where(paymentFilters.length ? and(...paymentFilters) : undefined)
              .orderBy(desc(paymentReceipts.createdAt))
              .limit(51)
              .offset((paymentPage - 1) * 50)
          : [];
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
      const manualOrderVariants =
        view === "orders"
          ? await tx
              .select({
                id: productVariants.id,
                productTitle: products.title,
                variantTitle: productVariants.title,
                sku: productVariants.sku,
              })
              .from(productVariants)
              .innerJoin(products, eq(products.id, productVariants.productId))
              .where(
                and(
                  eq(products.isPublished, true),
                  eq(productVariants.isAvailable, true),
                ),
              )
              .orderBy(products.title, productVariants.title)
          : [];
      const [commerceSummary] =
        view === "overview"
          ? await tx
              .select({
                revenueCents: sql<number>`coalesce(sum(${orders.purchaseTotalCents}), 0)::int`,
                orderCount: sql<number>`count(*)::int`,
                averageOrderCents: sql<number>`coalesce(avg(${orders.purchaseTotalCents}), 0)::int`,
              })
              .from(orders)
              .where(
                and(
                  sql`${orders.createdAt} >= now() - interval '30 days'`,
                  inArray(orders.lifecycleStatus, ["confirmed", "completed"]),
                ),
              )
          : [{ revenueCents: 0, orderCount: 0, averageOrderCents: 0 }];
      const [unitSummary] =
        view === "overview"
          ? await tx
              .select({
                units: sql<number>`coalesce(sum(${orderItems.quantity}), 0)::int`,
              })
              .from(orderItems)
              .innerJoin(orders, eq(orders.id, orderItems.orderId))
              .where(
                and(
                  sql`${orders.createdAt} >= now() - interval '30 days'`,
                  inArray(orders.lifecycleStatus, ["confirmed", "completed"]),
                ),
              )
          : [{ units: 0 }];
      const salesTrend =
        view === "overview"
          ? await tx
              .select({
                day: sql<string>`to_char(date_trunc('day', ${orders.createdAt}), 'YYYY-MM-DD')`,
                revenueCents: sql<number>`coalesce(sum(${orders.purchaseTotalCents}), 0)::int`,
                orders: sql<number>`count(*)::int`,
              })
              .from(orders)
              .where(
                and(
                  sql`${orders.createdAt} >= current_date - interval '6 days'`,
                  inArray(orders.lifecycleStatus, ["confirmed", "completed"]),
                ),
              )
              .groupBy(sql`date_trunc('day', ${orders.createdAt})`)
              .orderBy(asc(sql`date_trunc('day', ${orders.createdAt})`))
          : [];
      return {
        member,
        rows,
        accounts,
        receipts,
        paymentRows,
        allocations,
        attempts,
        discrepancies,
        evidence,
        failures,
        store,
        manualOrderVariants,
        commerceSummary,
        units: unitSummary?.units ?? 0,
        salesTrend,
        readiness: await getLaunchReadiness(tx),
      };
    })
    .catch((error: unknown) => {
      if (error instanceof ForbiddenError || error instanceof UnauthorizedError)
        redirect("/admin/login?error=staff");
      throw error;
    });
  const {
    member,
    rows,
    accounts,
    receipts,
    paymentRows,
    allocations,
    attempts,
    discrepancies,
    evidence,
    failures,
    store,
    manualOrderVariants,
    commerceSummary,
    units,
    salesTrend: rawSalesTrend,
    readiness,
  } = data;
  const salesByDay = new Map(rawSalesTrend.map((point) => [point.day, point]));
  const salesTrend = Array.from({ length: 7 }, (_, index) => {
    const day = new Date();
    day.setUTCHours(0, 0, 0, 0);
    day.setUTCDate(day.getUTCDate() - (6 - index));
    const key = day.toISOString().slice(0, 10);
    return salesByDay.get(key) ?? { day: key, revenueCents: 0, orders: 0 };
  });
  const maximumTrendRevenue = Math.max(
    ...salesTrend.map((point) => point.revenueCents),
    1,
  );
  const hasSalesRevenue = salesTrend.some((point) => point.revenueCents > 0);
  const overdueOrders = rows.filter(
    (order) =>
      order.lifecycleStatus === "unpaid" &&
      order.createdAt.getTime() < Date.now() - 86400000,
  );
  const returnTo = view === "overview" ? "/admin" : `/admin/${view}`;
  return (
    <main className="admin">
      <AdminNav />
      <p className="eyebrow">OPERATIONS OVERVIEW</p>
      <h1>
        {view === "overview"
          ? "Commerce overview"
          : view === "orders"
            ? "Orders"
            : view === "payments"
              ? "Payments"
              : "Fulfillment"}
      </h1>
      <p className="admin-description">
        {view === "overview"
          ? "Review confirmed sales from the last 30 days and operational queues from the latest 100 orders."
          : "Track payments, review orders, and keep fulfillment moving."}
      </p>
      {view === "orders" && member.role === "owner" && (
        <div className="admin-page-actions">
          <ManualOrderDialog
            variants={manualOrderVariants.map((variant) => ({
              id: variant.id,
              label: `${variant.productTitle} · ${variant.variantTitle} · ${variant.sku}`,
            }))}
            paymentAccounts={accounts
              .filter((account) => account.isActive)
              .map((account) => ({
                id: account.id,
                label: account.accountName,
              }))}
          />
          <a
            href="/api/admin/exports/orders"
            download
            className={buttonVariants({ variant: "outline" })}
          >
            <Download aria-hidden="true" />
            Export orders CSV
          </a>
          <a
            href="/api/admin/exports/orders?format=xlsx"
            download
            className={buttonVariants({ variant: "outline" })}
          >
            <Download aria-hidden="true" />
            Export orders XLSX
          </a>
        </div>
      )}
      <Notice error={query.error} />
      {query.created && view === "orders" && (
        <Alert>
          <AlertDescription>
            Manual order {query.created} created.
          </AlertDescription>
        </Alert>
      )}
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
      {view === "overview" && (
        <>
          <section className="commerce-kpis" aria-label="Commerce performance">
            <article>
              <span>Revenue · 30 days</span>
              <strong>
                {money(
                  commerceSummary?.revenueCents ?? 0,
                  store?.currency,
                  store?.precision,
                )}
              </strong>
            </article>
            <article>
              <span>Orders · 30 days</span>
              <strong>{commerceSummary?.orderCount ?? 0}</strong>
            </article>
            <article>
              <span>Average order</span>
              <strong>
                {money(
                  commerceSummary?.averageOrderCents ?? 0,
                  store?.currency,
                  store?.precision,
                )}
              </strong>
            </article>
            <article>
              <span>Units sold · 30 days</span>
              <strong>{units}</strong>
            </article>
          </section>
          <section className="panel sales-trend">
            <div>
              <p className="eyebrow">LAST 7 DAYS</p>
              <h2>Sales trend</h2>
            </div>
            {!hasSalesRevenue && (
              <p className="admin-empty">
                No sales revenue in the last 7 days.
              </p>
            )}
            <div
              className={`trend-bars${hasSalesRevenue ? "" : " trend-bars-empty"}`}
              role="region"
              aria-label="Daily sales for the last 7 days"
              tabIndex={0}
            >
              {salesTrend.map((point) => {
                const revenue = money(
                  point.revenueCents,
                  store?.currency,
                  store?.precision,
                );
                return (
                  <div className="trend-day" key={point.day}>
                    <span
                      aria-hidden="true"
                      style={{
                        height: `${(point.revenueCents / maximumTrendRevenue) * 100}%`,
                      }}
                    />
                    <small>{point.day.slice(5)}</small>
                    <b>{revenue}</b>
                    <small>
                      {point.orders} {point.orders === 1 ? "order" : "orders"}
                    </small>
                  </div>
                );
              })}
            </div>
          </section>
          <OperationsSummary
            unpaidOrders={
              rows.filter((o) => o.lifecycleStatus === "unpaid").length
            }
            evidenceReviews={evidence.length}
            readyForFulfillment={
              rows.filter((o) => o.lifecycleStatus === "confirmed").length
            }
            failedEmails={failures.length}
          />
        </>
      )}
      {view === "orders" && (
        <section className="panel">
          <h2>Order index</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Customer name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Fulfillment</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.slice(0, 50).map((order) => (
                <TableRow key={order.id}>
                  <TableCell>
                    <strong>{order.referenceCode}</strong>
                  </TableCell>
                  <TableCell>{order.guestName}</TableCell>
                  <TableCell>{order.guestEmail}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        order.lifecycleStatus === "completed" ||
                        order.lifecycleStatus === "confirmed"
                          ? "default"
                          : order.lifecycleStatus === "cancelled"
                            ? "destructive"
                            : "outline"
                      }
                    >
                      {order.lifecycleStatus}
                    </Badge>
                  </TableCell>
                  <TableCell>{order.fulfillmentType}</TableCell>
                  <TableCell>
                    {money(
                      order.purchaseTotalCents,
                      store?.currency,
                      store?.precision,
                    )}
                  </TableCell>
                  <TableCell>
                    <time dateTime={order.createdAt.toISOString()}>
                      {order.createdAt.toLocaleDateString("en-US", {
                        timeZone: "UTC",
                      })}
                    </time>
                  </TableCell>
                  <TableCell className="text-right">
                    <a
                      className="admin-edit-link"
                      href={
                        order.lifecycleStatus === "unpaid" ||
                        order.lifecycleStatus === "cancelled"
                          ? `/admin/orders?manage=${order.id}#order-payment-${order.id}`
                          : `/admin/fulfillment?manage=${order.id}#order-fulfillment-${order.id}`
                      }
                    >
                      Manage
                    </a>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
        <>
          <form method="get" className="admin-filter-bar payment-filter-bar">
            <label>
              Search payments
              <Input
                name="paymentQ"
                defaultValue={paymentSearch}
                placeholder="Customer, order, or reference"
              />
            </label>
            <label>
              Order status
              <NativeSelect name="paymentStatus" defaultValue={paymentStatus}>
                <option value="">All statuses</option>
                <option value="unpaid">Unpaid</option>
                <option value="confirmed">Confirmed</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </NativeSelect>
            </label>
            <label>
              Payment type
              <NativeSelect name="paymentType" defaultValue={paymentType}>
                <option value="">All types</option>
                <option value="cash">Cash</option>
                <option value="zelle">Zelle</option>
                <option value="venmo">Venmo</option>
                <option value="other">Other</option>
              </NativeSelect>
            </label>
            <Button type="submit">Filter</Button>
          </form>
          <section className="panel">
            <h2>Payment ledger</h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Payment reference</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Customer name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Order status</TableHead>
                  <TableHead>Payment type</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paymentRows.slice(0, 50).map(({ receipt, order, account }) => (
                  <TableRow key={receipt.id}>
                    <TableCell>
                      <strong>{receipt.normalizedReference}</strong>
                    </TableCell>
                    <TableCell>{order.referenceCode}</TableCell>
                    <TableCell>{order.guestName}</TableCell>
                    <TableCell>{order.guestEmail}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          order.lifecycleStatus === "completed" ||
                          order.lifecycleStatus === "confirmed"
                            ? "default"
                            : order.lifecycleStatus === "cancelled"
                              ? "destructive"
                              : "outline"
                        }
                      >
                        {order.lifecycleStatus}
                      </Badge>
                    </TableCell>
                    <TableCell className="capitalize">
                      {account.accountType}
                    </TableCell>
                    <TableCell>{account.accountName}</TableCell>
                    <TableCell>
                      {money(
                        receipt.amountCents,
                        store?.currency,
                        store?.precision,
                      )}
                    </TableCell>
                    <TableCell>
                      <time dateTime={receipt.createdAt.toISOString()}>
                        {receipt.createdAt.toLocaleDateString("en-US", {
                          timeZone: "UTC",
                        })}
                      </time>
                    </TableCell>
                    <TableCell className="text-right">
                      <a
                        className="admin-edit-link"
                        href={`/admin/payments?paymentQ=${encodeURIComponent(paymentSearch)}&paymentStatus=${paymentStatus}&paymentType=${paymentType}&managePayment=${order.id}#payment-${order.id}`}
                      >
                        Manage
                      </a>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {paymentRows.length === 0 && (
              <p className="admin-empty">No payments match these filters.</p>
            )}
            <nav className="admin-pagination" aria-label="Payment pages">
              {paymentPage > 1 && (
                <a
                  href={`/admin/payments?paymentQ=${encodeURIComponent(paymentSearch)}&paymentStatus=${paymentStatus}&paymentType=${paymentType}&paymentPage=${paymentPage - 1}`}
                >
                  ← Previous
                </a>
              )}
              {paymentRows.length > 50 && (
                <a
                  href={`/admin/payments?paymentQ=${encodeURIComponent(paymentSearch)}&paymentStatus=${paymentStatus}&paymentType=${paymentType}&paymentPage=${paymentPage + 1}`}
                >
                  Next →
                </a>
              )}
            </nav>
          </section>
        </>
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
            <Hidden name="returnTo" value={returnTo} />
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
      {view === "orders" && query.manage && (
        <AdminDialog
          defaultOpen
          title="Manage order payment"
          description="Record or confirm payment and update this order's financial terms."
        >
          <section className="admin-operation-dialog">
            {rows
              .filter(
                (o) =>
                  o.id === query.manage &&
                  (o.lifecycleStatus === "unpaid" ||
                    o.lifecycleStatus === "cancelled"),
              )
              .map((order) => (
                <details
                  className="panel"
                  id={`order-payment-${order.id}`}
                  key={order.id}
                  open={query.manage === order.id}
                >
                  <summary>
                    {order.referenceCode} · {order.guestName} ·{" "}
                    {money(
                      order.purchaseTotalCents,
                      store?.currency,
                      store?.precision,
                    )}
                  </summary>
                  <p>{order.guestEmail}</p>
                  <p>
                    <a href={`/admin/orders/${order.id}`}>Full order details</a>
                  </p>
                  {order.creditAppliedCents > 0 && (
                    <p>
                      Credit applied:{" "}
                      {money(
                        order.creditAppliedCents,
                        store?.currency,
                        store?.precision,
                      )}{" "}
                      · External total:{" "}
                      {money(
                        order.purchaseTotalCents - order.creditAppliedCents,
                        store?.currency,
                        store?.precision,
                      )}
                    </p>
                  )}
                  {order.lifecycleStatus === "cancelled" && (
                    <p>
                      Cancelled — record late payments for return. Recording a
                      receipt does not reopen the order.
                    </p>
                  )}
                  <form action={receivePayment}>
                    <Hidden name="returnTo" value={returnTo} />
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
                      receiving account and amount against the actual
                      transaction.
                    </label>
                    <Button type="submit">Record receipt</Button>
                  </form>
                  {order.lifecycleStatus === "unpaid" && (
                    <form action={confirmPayment}>
                      <Hidden name="returnTo" value={returnTo} />
                      <Hidden name="orderId" value={order.id} />
                      <Button type="submit" variant="outline">
                        Confirm exact payment
                      </Button>
                    </form>
                  )}
                  {member.role === "owner" &&
                    order.lifecycleStatus === "unpaid" && (
                      <form action={proposeChange}>
                        <Hidden name="returnTo" value={returnTo} />
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
                        <Hidden name="returnTo" value={returnTo} />
                        <Hidden name="orderId" value={order.id} />
                        <Field label="Cancellation reason" name="reason" />
                        <Button type="submit" variant="outline">
                          Cancel order
                        </Button>
                      </form>
                    )}
                  <form action={receiveCashPayment} className="mt-4">
                    <Hidden name="returnTo" value={returnTo} />
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
        </AdminDialog>
      )}
      {view === "payments" && (
        <section id="evidence">
          <h2>Payment evidence review</h2>
          {evidence.length === 0 && (
            <p className="admin-empty">No payment evidence awaiting review.</p>
          )}
          <div className="evidence-grid">
            {evidence.map((item) => {
              const order = rows.find((row) => row.id === item.orderId);
              const label = order?.referenceCode ?? item.orderId;
              return (
                <article className="evidence-card" key={item.id}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- authenticated evidence redirects cannot use the image optimizer */}
                  <img
                    src={`/api/evidence/${item.id}`}
                    alt={`Payment evidence submitted for order ${label}`}
                  />
                  <div>
                    <strong>{label}</strong>
                    <AdminDialog
                      trigger="Review evidence"
                      title={`Payment evidence · ${label}`}
                      description="Compare this image with the receiving account and recorded amount before confirming payment."
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- authenticated evidence redirects cannot use the image optimizer */}
                      <img
                        className="evidence-review-image"
                        src={`/api/evidence/${item.id}`}
                        alt={`Full-size payment evidence submitted for order ${label}`}
                      />
                      <a
                        className="admin-edit-link"
                        href={`/api/evidence/${item.id}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open original in a new tab ↗
                      </a>
                    </AdminDialog>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}
      {(view === "fulfillment" ||
        (view === "payments" && query.managePayment)) && (
        <AdminDialog
          inline={view === "fulfillment"}
          defaultOpen={view === "payments"}
          title="Manage payment"
          description="Review the receipt and perform authorized payment corrections or returns."
        >
          <section id="ready" className="admin-operation-dialog">
            <h2>
              {view === "payments"
                ? "Receipt and adjustments"
                : "Fulfillment operations"}
            </h2>
            {!rows.some(
              (order) =>
                order.lifecycleStatus === "confirmed" ||
                order.lifecycleStatus === "completed" ||
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
                  (view !== "payments" || o.id === query.managePayment) &&
                  (o.lifecycleStatus === "confirmed" ||
                    o.lifecycleStatus === "completed" ||
                    (member.role === "owner" &&
                      receipts.some((receipt) => receipt.orderId === o.id))),
              )
              .map((o) => (
                <details
                  className="panel"
                  id={
                    view === "payments"
                      ? `payment-${o.id}`
                      : `order-fulfillment-${o.id}`
                  }
                  key={o.id}
                  open={query.manage === o.id || query.managePayment === o.id}
                >
                  <summary>
                    {o.referenceCode} · {o.guestName} · {o.fulfillmentType}
                  </summary>
                  <p>{o.guestEmail}</p>
                  {view === "fulfillment" &&
                    o.lifecycleStatus === "confirmed" &&
                    (o.fulfillmentType === "pickup" ? (
                      <>
                        <form action={markOrderReady} className="mt-2">
                          <Hidden name="returnTo" value={returnTo} />
                          <Hidden name="orderId" value={o.id} />
                          <Button type="submit" variant="outline">
                            Mark ready for pickup
                          </Button>
                        </form>
                        <form action={completeOrderPickup} className="mt-2">
                          <Hidden name="returnTo" value={returnTo} />
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
                        <Hidden name="returnTo" value={returnTo} />
                        <Hidden name="orderId" value={o.id} />
                        <Field label="Carrier" name="carrier" />
                        <Field label="Tracking number" name="trackingNumber" />
                        <Button type="submit" variant="outline">
                          Mark shipped / delivered
                        </Button>
                      </form>
                    ))}
                  {view === "fulfillment" &&
                    member.role === "owner" &&
                    o.lifecycleStatus === "confirmed" && (
                      <form action={cancelAdminOrder} className="mt-2">
                        <Hidden name="returnTo" value={returnTo} />
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
                            <form
                              action={authorizeOrderRefund}
                              className="mt-2"
                            >
                              <Hidden name="returnTo" value={returnTo} />
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
                            <Hidden name="returnTo" value={returnTo} />
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
                          <form
                            action={correctRecordedReceipt}
                            className="mt-2"
                          >
                            <Hidden name="returnTo" value={returnTo} />
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
                  {view === "fulfillment" && (
                    <form action={correctOrderFulfillment} className="mt-2">
                      <Hidden name="returnTo" value={`/admin/${view}`} />
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
                  )}
                </details>
              ))}
          </section>
        </AdminDialog>
      )}
      {(view === "overview" || view === "orders") && (
        <section>
          <h2>Overdue / abandoned review</h2>
          {overdueOrders.length === 0 && (
            <p className="admin-empty">No overdue orders in this view.</p>
          )}
          {overdueOrders.map((o) => (
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
              No failed email deliveries. You&apos;re all caught up.
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
            {allocations.length === 0 && (
              <p className="admin-empty">
                No payouts or discrepancies to review.
              </p>
            )}
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
                      <Hidden name="returnTo" value={returnTo} />
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
                          <Hidden name="returnTo" value={returnTo} />
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
                          <Hidden name="returnTo" value={returnTo} />
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
                          <Hidden name="returnTo" value={returnTo} />
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
