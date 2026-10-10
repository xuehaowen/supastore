import {
  ConflictError,
  DomainError,
  NotFoundError,
} from "@/application/common/errors";
import {
  parseActionRequiredText,
  parseActionUuid,
} from "@/application/common/request-validation";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { db } from "@/infrastructure/db";
import {
  auditRecords,
  categories,
  storeSettings,
} from "@/infrastructure/db/schema";
import { eq } from "drizzle-orm";

export async function createCategory(input: {
  staffUserId: string;
  name: string;
  slug: string;
  parentId?: string;
}) {
  const name = parseActionRequiredText(input.name, "Category name", 200);
  const slug = input.slug.trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
    throw new DomainError("Enter a category name and valid URL handle.");
  const parentId = input.parentId
    ? parseActionUuid(input.parentId, "Parent category")
    : null;
  return db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, input.staffUserId, "owner");
    await tx.select().from(storeSettings).for("update");
    const [duplicate] = await tx
      .select()
      .from(categories)
      .where(eq(categories.slug, slug));
    if (duplicate)
      throw new ConflictError("That category handle is already in use.");
    if (parentId) {
      const [parent] = await tx
        .select()
        .from(categories)
        .where(eq(categories.id, parentId));
      if (!parent) throw new NotFoundError("Parent category not found.");
    }
    const [category] = await tx
      .insert(categories)
      .values({ name, slug, parentId })
      .returning();
    await tx.insert(auditRecords).values({
      entityType: "category",
      entityId: category!.id,
      actorId: input.staffUserId,
      action: "created",
      details: { name, slug, parentId },
    });
    return category!;
  });
}
