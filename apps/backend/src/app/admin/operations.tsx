import { AdminNav } from "@/app/admin/admin-nav";
import { Notice } from "@/app/components";
import { ForbiddenError, UnauthorizedError } from "@/application/common/errors";
import { getAdminOperations } from "@/application/queries/admin-operations";
import { staffIdentity } from "@/infrastructure/web";
import { redirect } from "next/navigation";
import { FulfillmentOperations } from "./fulfillment-operations";
import type {
  OperationsQuery,
  OperationsScreenProps,
} from "./operations-types";
import { OrdersView } from "./orders-view";
import { OverviewView } from "./overview-view";
import { PaymentsView } from "./payments-view";
import { PayoutQueue } from "./payout-queue";
import { queuePage } from "./queue-pagination";
import { adminQueueReturnContext } from "@/application/common/admin-return-context";
export default async function Admin({
  searchParams,
  view = "overview",
}: {
  searchParams: Promise<OperationsQuery>;
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
  const payoutPage = queuePage(query.payoutPage);
  const evidencePage = queuePage(query.evidencePage);
  const failurePage = queuePage(query.failurePage);
  const fulfillmentPage = queuePage(query.fulfillmentPage);
  const managed = view === "payments" ? query.managePayment : query.manage;
  const managedOrderId =
    managed &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      managed,
    )
      ? managed
      : undefined;
  const data = await getAdminOperations({
    staffUserId: staff,
    view,
    search,
    status,
    page,
    paymentSearch,
    paymentStatus,
    paymentType,
    paymentPage,
    payoutPage,
    evidencePage,
    failurePage,
    fulfillmentPage,
    ...(managedOrderId ? { managedOrderId } : {}),
  }).catch((error: unknown) => {
    if (error instanceof ForbiddenError || error instanceof UnauthorizedError)
      redirect("/admin/login?error=staff");
    throw error;
  });
  const { rows } = data;
  const overdueOrders = rows.filter(
    (order) =>
      order.lifecycleStatus === "unpaid" &&
      order.createdAt.getTime() < Date.now() - 86400000,
  );
  const returnTo = adminQueueReturnContext(
    view === "overview" ? "/admin" : `/admin/${view}`,
    query,
  );
  const screenProps: OperationsScreenProps = {
    data,
    query,
    view,
    returnTo,
    filters: {
      search,
      status,
      page,
      paymentSearch,
      paymentStatus,
      paymentType,
      paymentPage,
      evidencePage,
      failurePage,
      fulfillmentPage,
    },
  };
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
      <Notice error={query.error} />
      {view === "orders" && <OrdersView {...screenProps} />}

      {view === "overview" && <OverviewView {...screenProps} />}

      {view === "payments" && <PaymentsView {...screenProps} />}

      <FulfillmentOperations {...screenProps} />
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

      <PayoutQueue
        data={data}
        view={view}
        query={query}
        returnTo={returnTo}
        payoutPage={payoutPage}
      />
    </main>
  );
}
