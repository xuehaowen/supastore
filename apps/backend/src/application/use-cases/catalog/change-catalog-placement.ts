import { sql, type SQL } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import { auditRecords, storeSettings } from "@/infrastructure/db/schema";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import {
  ConflictError,
  DomainError,
  NotFoundError,
} from "@/application/common/errors";
import {
  parseActionEnum,
  parseActionInteger,
  parseActionUuid,
} from "@/application/common/request-validation";
import { moveCatalogItem } from "@/domain/catalog/catalog-placement";

export type PlacementKind =
  | "product"
  | "category"
  | "collection"
  | "category-product"
  | "collection-product";

export async function changeCatalogPlacement(input: {
  staffUserId: string;
  kind: string;
  id: string;
  scopeId?: string;
  operation: string;
  position?: unknown;
  expectedPosition: unknown;
  expectedPinned: string;
}) {
  const kind = parseActionEnum(input.kind, "Placement scope", [
    "product",
    "category",
    "collection",
    "category-product",
    "collection-product",
  ] as const);
  const id = parseActionUuid(input.id, "Catalog item");
  const operation = parseActionEnum(input.operation, "Placement action", [
    "save",
    "up",
    "down",
    "top",
    "pin",
    "unpin",
  ] as const);
  const scoped = kind === "category-product" || kind === "collection-product";
  const scopeId = scoped
    ? parseActionUuid(input.scopeId, "Placement scope")
    : undefined;
  const nullable = kind === "product" || kind === "category-product";
  const expectedPosition =
    input.expectedPosition === "auto" && nullable
      ? null
      : parseActionInteger(
          input.expectedPosition,
          "Previous position",
          -2147483648,
          2147483647,
        );
  const expectedPinned =
    parseActionEnum(input.expectedPinned, "Previous pin state", [
      "true",
      "false",
    ] as const) === "true";
  const position =
    operation === "save"
      ? input.position === "" && nullable
        ? null
        : parseActionInteger(input.position, "Position", 0, 1000000)
      : undefined;

  return db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, input.staffUserId, "owner");
    // All catalog membership and ordering writes take this lock before touching rows.
    await tx.select().from(storeSettings).for("update");
    const table =
      kind === "category"
        ? sql`categories`
        : kind === "collection"
          ? sql`product_collections`
          : kind === "category-product"
            ? sql`product_categories`
            : kind === "collection-product"
              ? sql`product_collection_memberships`
              : sql`products`;
    const key = scoped ? sql`product_id` : sql`id`;
    let scope: SQL =
      kind === "category-product"
        ? sql`category_id = ${scopeId}::uuid`
        : kind === "collection-product"
          ? sql`collection_id = ${scopeId}::uuid`
          : sql`true`;
    const [current] = await tx.execute<{
      id: string;
      position: number | null;
      pinned: boolean;
      parentId?: string | null;
    }>(sql`
      select ${key} as id, sort_order as position, is_pinned as pinned ${kind === "category" ? sql`, parent_id as "parentId"` : sql``}
      from ${table} where ${key} = ${id}::uuid and ${scope} for update
    `);
    if (!current)
      throw new NotFoundError("Catalog item is no longer in this scope.");
    if (
      current.position !== expectedPosition ||
      current.pinned !== expectedPinned
    )
      throw new ConflictError("The placement changed. Reload before saving.");
    if (kind === "category")
      scope = sql`parent_id is not distinct from ${current.parentId ?? null}::uuid`;

    if (operation === "save" || operation === "pin" || operation === "unpin") {
      await tx.execute(
        sql`update ${table} set ${operation === "save" ? sql`sort_order = ${position}` : sql`is_pinned = ${operation === "pin"}`} where ${key} = ${id}::uuid and ${scope}`,
      );
    } else {
      const fallback =
        kind === "category"
          ? sql`slug, id`
          : kind === "collection"
            ? sql`handle, id`
            : kind === "product"
              ? sql`created_at desc, id`
              : kind === "category-product"
                ? sql`(select created_at from products where products.id = product_categories.product_id) desc, product_id`
                : sql`product_id`;
      const rows = await tx.execute<{
        id: string;
        position: number | null;
      }>(sql`
        select ${key} as id, sort_order as position from ${table}
        where ${scope} and is_pinned = ${current.pinned}
        order by sort_order asc nulls last, ${fallback}
      `);
      if (rows.length > 1000000)
        throw new DomainError("Too many catalog items to reorder.");
      const moved = moveCatalogItem([...rows], id, operation);
      const previous = new Map(rows.map((row) => [row.id, row.position]));
      const changes = moved.filter(
        (row) => previous.get(row.id) !== row.position,
      );
      for (let offset = 0; offset < changes.length; offset += 1000) {
        const values = sql.join(
          changes
            .slice(offset, offset + 1000)
            .map((row) => sql`(${row.id}::uuid, ${row.position}::integer)`),
          sql`, `,
        );
        await tx.execute(
          sql`update ${table} as target set sort_order = placement.position from (values ${values}) as placement(id, position) where target.${key} = placement.id and ${scope}`,
        );
      }
    }
    if (kind === "collection" || kind === "collection-product") {
      await tx.execute(
        sql`update product_collections set revision = revision + 1, updated_at = now() where id = ${kind === "collection" ? id : scopeId}::uuid`,
      );
    }
    await tx.insert(auditRecords).values({
      entityType: kind,
      entityId: scoped ? scopeId! : id,
      actorId: input.staffUserId,
      action: "storefront.placement_changed",
      details: {
        productId: scoped ? id : undefined,
        operation,
        position,
        previousPosition: current.position,
        previousPinned: current.pinned,
      },
    });
  });
}
