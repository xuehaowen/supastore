import { and, desc, eq } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  customers,
  customerAddresses,
  orders,
  user,
  auditRecords,
} from "@/infrastructure/db/schema";
import { verifyOrderAccess } from "@/application/common/guest-access";
import {
  UnauthorizedError,
  ConflictError,
  NotFoundError,
  DomainError,
} from "@/application/common/errors";
import {
  parseActionUuid,
  parseActionRequiredText,
} from "@/application/common/request-validation";
import { issueOrderSession } from "@/application/use-cases/guest/create-guest-session";
import type { Transaction } from "@/application/common/transaction";
import { customerCredit } from "../store-credit/credit-operations";

// userId is obtained from the verified server session, never from form data.
export async function verifiedCustomer(tx: Transaction, userId: string) {
  const [identity] = await tx
    .select()
    .from(user)
    .where(and(eq(user.id, userId), eq(user.emailVerified, true)));
  if (!identity)
    throw new UnauthorizedError("Sign in with a verified customer account.");
  const [customer] = await tx
    .insert(customers)
    .values({
      authUserId: identity.id,
      name: identity.name,
      email: identity.email,
    })
    .onConflictDoUpdate({
      target: customers.authUserId,
      set: {
        name: identity.name,
        email: identity.email,
        updatedAt: new Date(),
      },
    })
    .returning();
  return customer!;
}
export async function claimGuestOrder(input: {
  userId: string;
  orderId: string;
  token: string;
}) {
  parseActionUuid(input.orderId, "Order");
  return db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, input.orderId))
      .for("update");
    if (!order) throw new NotFoundError("Order not found.");
    await verifyOrderAccess(tx, order.id, input.token);
    const customer = await verifiedCustomer(tx, input.userId);
    if (order.customerId && order.customerId !== customer.id)
      throw new ConflictError("This order already belongs to another account.");
    if (!order.customerId) {
      await tx
        .update(orders)
        .set({ customerId: customer.id, updatedAt: new Date() })
        .where(eq(orders.id, order.id));
      await tx
        .insert(auditRecords)
        .values({
          entityType: "order",
          entityId: order.id,
          actorId: input.userId,
          action: "customer.claimed",
          details: { customerId: customer.id },
        });
    }
  });
}
export async function customerAccount(userId: string, page = 1) {
  return db.transaction(async (tx) => {
    const customer = await verifiedCustomer(tx, userId);
    const history = await tx
      .select()
      .from(orders)
      .where(eq(orders.customerId, customer.id))
      .orderBy(desc(orders.createdAt), desc(orders.id))
      .limit(26)
      .offset((Math.min(10000, Math.max(1, Math.floor(page) || 1)) - 1) * 25);
    const addresses = await tx
      .select()
      .from(customerAddresses)
      .where(eq(customerAddresses.customerId, customer.id))
      .orderBy(desc(customerAddresses.createdAt))
      .limit(20);
    return {
      customer,
      orders: history.slice(0, 25),
      hasNext: history.length > 25,
      addresses,
      credit: await customerCredit(tx, customer.id),
    };
  });
}
export async function openOwnedOrder(userId: string, orderId: string) {
  parseActionUuid(orderId, "Order");
  return db.transaction(async (tx) => {
    const customer = await verifiedCustomer(tx, userId);
    const [order] = await tx
      .select()
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.customerId, customer.id)));
    if (!order) throw new NotFoundError("Order not found.");
    return issueOrderSession(tx, order.id);
  });
}
export async function saveCustomerAddress(input: {
  userId: string;
  id?: string;
  label: string;
  address: Record<string, string>;
  remove?: boolean;
}) {
  const id = input.id ? parseActionUuid(input.id, "Address") : undefined;
  const label = parseActionRequiredText(input.label, "Address label", 80);
  const allowed = [
    "name",
    "line1",
    "line2",
    "city",
    "region",
    "postalCode",
    "country",
    "phone",
  ];
  if (
    Object.entries(input.address).some(
      ([key, value]) =>
        !allowed.includes(key) ||
        typeof value !== "string" ||
        value.length > 200,
    )
  )
    throw new DomainError("Invalid address.");
  if (!input.remove)
    for (const key of ["name", "line1", "city", "country"])
      parseActionRequiredText(input.address[key], key, 200);
  return db.transaction(async (tx) => {
    const customer = await verifiedCustomer(tx, input.userId);
    const existing = await tx
      .select()
      .from(customerAddresses)
      .where(eq(customerAddresses.customerId, customer.id))
      .for("update");
    if (input.remove) {
      if (!id || !existing.some((a) => a.id === id))
        throw new NotFoundError("Address not found.");
      await tx
        .delete(customerAddresses)
        .where(
          and(
            eq(customerAddresses.id, id),
            eq(customerAddresses.customerId, customer.id),
          ),
        );
    } else if (id) {
      if (!existing.some((a) => a.id === id))
        throw new NotFoundError("Address not found.");
      await tx
        .update(customerAddresses)
        .set({ label, address: input.address })
        .where(eq(customerAddresses.id, id));
    } else {
      if (existing.length >= 20)
        throw new DomainError("You can save up to 20 addresses.");
      await tx
        .insert(customerAddresses)
        .values({ customerId: customer.id, label, address: input.address });
    }
  });
}
