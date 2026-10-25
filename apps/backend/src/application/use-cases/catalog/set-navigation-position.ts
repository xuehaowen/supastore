import { eq, sql } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  categories,
  productCollections,
  storeSettings,
  auditRecords,
} from "@/infrastructure/db/schema";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { ConflictError, NotFoundError } from "@/application/common/errors";
import {
  parseActionEnum,
  parseActionInteger,
  parseActionUuid,
} from "@/application/common/request-validation";

export async function setNavigationPosition(input: {
  staffUserId: string;
  kind: string;
  id: string;
  position: unknown;
  expectedPosition: unknown;
}) {
  const kind = parseActionEnum(input.kind, "Catalog type", [
    "category",
    "collection",
  ] as const);
  const id = parseActionUuid(input.id, "Catalog item");
  const position = parseActionInteger(
    input.position,
    "Storefront order",
    0,
    1000000,
  );
  const expected = parseActionInteger(
    input.expectedPosition,
    "Previous storefront order",
    -2147483648,
    2147483647,
  );
  return db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, input.staffUserId, "owner");
    await tx.select().from(storeSettings).for("update");
    const table = kind === "category" ? categories : productCollections;
    const [current] = await tx
      .select({ position: table.sortOrder })
      .from(table)
      .where(eq(table.id, id))
      .for("update");
    if (!current) throw new NotFoundError("Catalog item not found.");
    if (current.position !== expected)
      throw new ConflictError(
        "The storefront order changed. Reload before saving.",
      );
    if (kind === "category")
      await tx
        .update(categories)
        .set({ sortOrder: position })
        .where(eq(categories.id, id));
    else
      await tx
        .update(productCollections)
        .set({
          sortOrder: position,
          revision: sql`${productCollections.revision} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(productCollections.id, id));
    await tx.insert(auditRecords).values({
      entityType: kind,
      entityId: id,
      actorId: input.staffUserId,
      action: "storefront.order_changed",
      details: { previousPosition: current.position, position },
    });
  });
}
