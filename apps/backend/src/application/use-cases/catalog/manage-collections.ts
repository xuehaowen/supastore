import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  productCollections,
  collectionMemberships,
  collectionTranslations,
  products,
  auditRecords,
  storeSettings,
} from "@/infrastructure/db/schema";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import {
  ConflictError,
  DomainError,
  NotFoundError,
} from "@/application/common/errors";
import {
  parseActionRequiredText,
  parseActionUuid,
  parseActionInteger,
} from "@/application/common/request-validation";

export async function saveCollection(input: {
  staffUserId: string;
  id?: string;
  revision?: number;
  title: string;
  handle: string;
  description: string;
  isPublished: boolean;
}) {
  const title = parseActionRequiredText(input.title, "Collection title", 200);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.handle))
    throw new DomainError(
      "Use lowercase letters, numbers, and hyphens for the handle.",
    );
  if (input.description.length > 20000)
    throw new DomainError("Description is too long.");
  const id = input.id ? parseActionUuid(input.id, "Collection") : undefined;
  return db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, input.staffUserId, "owner");
    await tx.select().from(storeSettings).for("update");
    const [duplicate] = await tx
      .select()
      .from(productCollections)
      .where(eq(productCollections.handle, input.handle));
    if (duplicate && duplicate.id !== id)
      throw new ConflictError("That collection handle is already in use.");
    const data = {
      title,
      handle: input.handle,
      description: input.description,
      isPublished: input.isPublished,
    };
    let collection;
    if (id) {
      const revision = parseActionInteger(
        input.revision,
        "Collection revision",
        1,
        2147483647,
      );
      [collection] = await tx
        .update(productCollections)
        .set({
          ...data,
          revision: sql`${productCollections.revision} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(productCollections.id, id),
            eq(productCollections.revision, revision),
          ),
        )
        .returning();
      if (!collection)
        throw new ConflictError(
          "The collection changed. Reload before saving.",
        );
    } else
      [collection] = await tx
        .insert(productCollections)
        .values(data)
        .returning();
    await tx.insert(auditRecords).values({
      entityType: "collection",
      entityId: collection!.id,
      actorId: input.staffUserId,
      action: id ? "updated" : "created",
    });
    return collection!.id;
  });
}

export async function changeCollectionMember(input: {
  staffUserId: string;
  collectionId: string;
  revision: number;
  productId: string;
  remove: boolean;
  sortOrder: number;
}) {
  const collectionId = parseActionUuid(input.collectionId, "Collection");
  const productId = parseActionUuid(input.productId, "Product");
  const sortOrder = parseActionInteger(input.sortOrder, "Position", 0, 1000000);
  return db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, input.staffUserId, "owner");
    await tx.select().from(storeSettings).for("update");
    const [collection] = await tx
      .select()
      .from(productCollections)
      .where(eq(productCollections.id, collectionId))
      .for("update");
    if (!collection) throw new NotFoundError("Collection not found.");
    if (collection.revision !== input.revision)
      throw new ConflictError("The collection changed. Reload before saving.");
    const [product] = await tx
      .select({ id: products.id })
      .from(products)
      .where(eq(products.id, productId));
    if (!product) throw new NotFoundError("Product not found.");
    if (!input.remove) {
      const memberships = await tx
        .select()
        .from(collectionMemberships)
        .where(eq(collectionMemberships.productId, productId))
        .limit(21);
      if (
        memberships.length >= 20 &&
        !memberships.some((m) => m.collectionId === collectionId)
      )
        throw new DomainError("A product can belong to up to 20 collections.");
    }
    if (input.remove)
      await tx
        .delete(collectionMemberships)
        .where(
          and(
            eq(collectionMemberships.collectionId, collectionId),
            eq(collectionMemberships.productId, productId),
          ),
        );
    else
      await tx
        .insert(collectionMemberships)
        .values({ collectionId, productId, sortOrder })
        .onConflictDoUpdate({
          target: [
            collectionMemberships.collectionId,
            collectionMemberships.productId,
          ],
          set: { sortOrder },
        });
    await tx
      .update(productCollections)
      .set({ revision: collection.revision + 1, updatedAt: new Date() })
      .where(eq(productCollections.id, collectionId));
    await tx.insert(auditRecords).values({
      entityType: "collection",
      entityId: collectionId,
      actorId: input.staffUserId,
      action: input.remove ? "product.removed" : "product.added",
      details: { productId, sortOrder },
    });
  });
}

export async function saveCollectionTranslation(input: {
  staffUserId: string;
  collectionId: string;
  locale: "en" | "zh";
  title: string;
  description: string;
}) {
  const collectionId = parseActionUuid(input.collectionId, "Collection");
  const title = parseActionRequiredText(input.title, "Translated title", 200);
  if (!["en", "zh"].includes(input.locale) || input.description.length > 20000)
    throw new DomainError("Invalid translation.");
  return db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, input.staffUserId, "owner");
    const [collection] = await tx
      .select()
      .from(productCollections)
      .where(eq(productCollections.id, collectionId))
      .for("update");
    if (!collection) throw new NotFoundError("Collection not found.");
    await tx
      .insert(collectionTranslations)
      .values({
        collectionId,
        locale: input.locale,
        title,
        description: input.description,
      })
      .onConflictDoUpdate({
        target: [
          collectionTranslations.collectionId,
          collectionTranslations.locale,
        ],
        set: { title, description: input.description },
      });
    await tx.insert(auditRecords).values({
      entityType: "collection",
      entityId: collectionId,
      actorId: input.staffUserId,
      action: "translation.updated",
      details: { locale: input.locale },
    });
  });
}

export async function getCollectionAdmin(
  staffUserId: string,
  id: string,
  search = "",
  page = 1,
  memberSearch = "",
) {
  parseActionUuid(id, "Collection");
  return db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, staffUserId, "owner");
    const [collection] = await tx
      .select()
      .from(productCollections)
      .where(eq(productCollections.id, id));
    if (!collection) return null;
    const members = await tx
      .select({
        product: products,
        position: collectionMemberships.sortOrder,
        pinned: collectionMemberships.isPinned,
      })
      .from(collectionMemberships)
      .innerJoin(products, eq(products.id, collectionMemberships.productId))
      .where(
        and(
          eq(collectionMemberships.collectionId, id),
          sql`${products.title} ilike ${`%${memberSearch
            .trim()
            .slice(0, 120)
            .replace(/[\\%_]/g, "\\$&")}%`}`,
        ),
      )
      .orderBy(
        sql`${collectionMemberships.isPinned} desc`,
        asc(collectionMemberships.sortOrder),
        asc(products.id),
      )
      .limit(26)
      .offset((Math.min(10000, Math.max(1, Math.floor(page) || 1)) - 1) * 25);
    const pattern = `%${search
      .trim()
      .slice(0, 120)
      .replace(/[\\%_]/g, "\\$&")}%`;
    const candidates = await tx
      .select({ id: products.id, title: products.title })
      .from(products)
      .where(sql`${products.title} ilike ${pattern}`)
      .orderBy(asc(products.title), asc(products.id))
      .limit(25);
    const translations = await tx
      .select()
      .from(collectionTranslations)
      .where(eq(collectionTranslations.collectionId, id));
    return {
      collection,
      members: members.slice(0, 25),
      hasNext: members.length > 25,
      candidates,
      translations,
    };
  });
}
