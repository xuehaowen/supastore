import { getLaunchReadiness } from "@/application/use-cases/store/get-launch-readiness";
import { getDashboardSales } from "./dashboard-sales";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { db } from "@/infrastructure/db";
import {
  eventDeliveries,
  orders,
  orderFulfillments,
  orderItems,
  orderShipments,
  shipmentItems,
  paymentAccounts,
  pickupLocation,
  paymentReceipts,
  paymentUploadIntents,
  payoutAllocations,
  payoutAttempts,
  payoutDiscrepancies,
  products,
  productVariants,
  storeSettings,
} from "@/infrastructure/db/schema";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
export interface AdminOperationsInput {
  staffUserId: string;
  view: "overview" | "orders" | "payments" | "fulfillment";
  search: string;
  status: string;
  page: number;
  paymentSearch: string;
  paymentStatus: string;
  paymentType: string;
  paymentPage: number;
  payoutPage: number;
  evidencePage: number;
  failurePage: number;
  fulfillmentPage?: number;
  fulfillmentWork?: string;
  managedOrderId?: string;
}
export async function getAdminOperations(input: AdminOperationsInput) {
  const {
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
  } = input;
  return db.transaction(
    async (tx) => {
      const member = await verifyStaffInTransaction(tx, input.staffUserId);
      const remainingShipmentUnits = sql`exists (select 1 from ${orderItems} where ${orderItems.orderId} = ${orders.id} and ${orderItems.quantity} > coalesce((select sum(${shipmentItems.quantity}) from ${shipmentItems} inner join ${orderShipments} on ${orderShipments.id} = ${shipmentItems.shipmentId} where ${shipmentItems.orderItemId} = ${orderItems.id} and ${orderShipments.orderId} = ${orders.id}), 0))`;
      const orderFilters =
        view === "orders" || view === "fulfillment"
          ? [
              ...(status && view === "orders"
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
      if (view === "fulfillment") {
        const work = [
          "prepare",
          "ready",
          "transit",
          "completed",
          "all",
        ].includes(input.fulfillmentWork ?? "")
          ? input.fulfillmentWork
          : "active";
        if (work !== "all") {
          orderFilters.push(
            eq(
              orders.lifecycleStatus,
              work === "completed" ? "completed" : "confirmed",
            ),
          );
          if (work === "prepare")
            orderFilters.push(
              sql`not exists (select 1 from ${orderFulfillments} where ${orderFulfillments.orderId} = ${orders.id} and (${orderFulfillments.status} in ('ready_for_pickup','fulfilled') or (${orderFulfillments.status} = 'shipped' and not ${remainingShipmentUnits})))`,
            );
          if (work === "ready")
            orderFilters.push(
              eq(orders.fulfillmentType, "pickup"),
              sql`exists (select 1 from ${orderFulfillments} where ${orderFulfillments.orderId} = ${orders.id} and ${orderFulfillments.status} = 'ready_for_pickup')`,
            );
          if (work === "transit")
            orderFilters.push(
              sql`exists (select 1 from ${orderFulfillments} where ${orderFulfillments.orderId} = ${orders.id} and ${orderFulfillments.status} = 'shipped')`,
            );
        } else {
          orderFilters.push(
            or(
              inArray(orders.lifecycleStatus, ["confirmed", "completed"]),
              member.role === "owner"
                ? sql`exists (select 1 from ${paymentReceipts} where ${paymentReceipts.orderId} = ${orders.id})`
                : undefined,
            )!,
          );
        }
      }
      const paginated = view === "orders" || view === "fulfillment";
      const resultRows = await tx
        .select()
        .from(orders)
        .where(orderFilters.length ? and(...orderFilters) : undefined)
        .orderBy(desc(orders.createdAt), desc(orders.id))
        .limit(paginated ? 51 : 100)
        .offset(
          view === "orders"
            ? (page - 1) * 50
            : view === "fulfillment"
              ? ((input.fulfillmentPage ?? 1) - 1) * 50
              : 0,
        );
      const rows =
        view === "fulfillment" ? resultRows.slice(0, 50) : resultRows;
      const managedOrders = input.managedOrderId
        ? await tx
            .select()
            .from(orders)
            .where(eq(orders.id, input.managedOrderId))
            .limit(1)
        : [];
      const accounts = await tx.select().from(paymentAccounts);
      const displayedOrderIds = (
        managedOrders.length ? managedOrders : rows
      ).map((order) => order.id);
      const partialShipmentOrders =
        view === "fulfillment" && displayedOrderIds.length
          ? await tx
              .select({ id: orders.id })
              .from(orders)
              .where(
                and(
                  inArray(orders.id, displayedOrderIds),
                  remainingShipmentUnits,
                  sql`exists (select 1 from ${orderShipments} where ${orderShipments.orderId} = ${orders.id})`,
                ),
              )
          : [];
      const fulfillmentRows =
        view === "fulfillment" && (managedOrders.length || rows.length)
          ? await tx
              .select()
              .from(orderFulfillments)
              .where(
                inArray(
                  orderFulfillments.orderId,
                  (managedOrders.length ? managedOrders : rows).map(
                    (order) => order.id,
                  ),
                ),
              )
          : [];
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
              .orderBy(
                desc(paymentReceipts.createdAt),
                desc(paymentReceipts.id),
              )
              .limit(51)
              .offset((paymentPage - 1) * 50)
          : [];
      const orderIds = [
        ...new Set([
          ...rows.map((row) => row.id),
          ...paymentRows.map((row) => row.order.id),
          ...managedOrders.map((row) => row.id),
        ]),
      ];
      const receipts = orderIds.length
        ? await tx
            .select()
            .from(paymentReceipts)
            .where(inArray(paymentReceipts.orderId, orderIds))
        : [];
      const allocations =
        (view === "overview" || view === "payments") && member.role === "owner"
          ? await tx
              .select()
              .from(payoutAllocations)
              .orderBy(
                desc(payoutAllocations.createdAt),
                desc(payoutAllocations.id),
              )
              .limit(51)
              .offset((payoutPage - 1) * 50)
          : [];
      const allocationIds = allocations.slice(0, 50).map((row) => row.id);
      const attempts = allocationIds.length
        ? await tx
            .select()
            .from(payoutAttempts)
            .where(inArray(payoutAttempts.allocationId, allocationIds))
            .orderBy(desc(payoutAttempts.createdAt), desc(payoutAttempts.id))
        : [];
      const attemptIds = attempts.map((row) => row.id);
      const discrepancies = attemptIds.length
        ? await tx
            .select()
            .from(payoutDiscrepancies)
            .where(inArray(payoutDiscrepancies.payoutAttemptId, attemptIds))
        : [];
      const evidence =
        view === "payments"
          ? await tx
              .select()
              .from(paymentUploadIntents)
              .where(eq(paymentUploadIntents.status, "finalized"))
              .orderBy(
                desc(paymentUploadIntents.createdAt),
                desc(paymentUploadIntents.id),
              )
              .limit(51)
              .offset((evidencePage - 1) * 50)
          : [];
      const failures =
        view === "overview"
          ? await tx
              .select()
              .from(eventDeliveries)
              .where(
                inArray(eventDeliveries.status, [
                  "retrying",
                  "exhausted",
                  "failed",
                  "review",
                ]),
              )
              .orderBy(
                desc(eventDeliveries.createdAt),
                desc(eventDeliveries.id),
              )
              .limit(51)
              .offset((failurePage - 1) * 50)
          : [];
      const [queueCounts] =
        view === "overview"
          ? await tx
              .select({
                unpaidOrders: sql<number>`(select count(*)::int from ${orders} where ${orders.lifecycleStatus} = 'unpaid')`,
                readyForFulfillment: sql<number>`(select count(*)::int from ${orders} where ${orders.lifecycleStatus} = 'confirmed')`,
                evidenceReviews: sql<number>`(select count(*)::int from ${paymentUploadIntents} where ${paymentUploadIntents.status} = 'finalized')`,
                failedEmails: sql<number>`(select count(*)::int from ${eventDeliveries} where ${eventDeliveries.status} in ('retrying', 'exhausted', 'failed', 'review'))`,
              })
              .from(sql`(select 1) as summary`)
          : [
              {
                unpaidOrders: 0,
                readyForFulfillment: 0,
                evidenceReviews: 0,
                failedEmails: 0,
              },
            ];
      const [store] = await tx.select().from(storeSettings).limit(1);
      const manualOrderVariants =
        view === "orders" && member.role === "owner"
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
              .orderBy(productVariants.sku, productVariants.id)
              .limit(50)
          : [];
      const metrics =
        view === "overview" && store
          ? await getDashboardSales(tx, store.timezone, new Date())
          : {
              commerceSummary: {
                revenueCents: 0,
                orderCount: 0,
                averageOrderCents: 0,
              },
              units: 0,
              salesTrend: [],
            };
      const manualPickupLocations =
        view === "orders" && member.role === "owner"
          ? await tx
              .select()
              .from(pickupLocation)
              .orderBy(pickupLocation.name, pickupLocation.id)
          : [];
      return {
        member,
        rows,
        managedOrders,
        fulfillmentRows,
        partialShipmentOrderIds: partialShipmentOrders.map((order) => order.id),
        fulfillmentHasNext: view === "fulfillment" && resultRows.length > 50,
        accounts,
        receipts,
        paymentRows,
        allocations: allocations.slice(0, 50),
        payoutHasNext: allocations.length > 50,
        attempts,
        discrepancies,
        evidence: evidence.slice(0, 50),
        evidenceHasNext: evidence.length > 50,
        failures: failures.slice(0, 50),
        failureHasNext: failures.length > 50,
        queueCounts: queueCounts!,
        store,
        manualOrderVariants,
        manualPickupLocations,
        ...metrics,
        readiness: await getLaunchReadiness(tx),
      };
    },
    { isolationLevel: "repeatable read" },
  );
}
export type AdminOperationsData = Awaited<
  ReturnType<typeof getAdminOperations>
>;
