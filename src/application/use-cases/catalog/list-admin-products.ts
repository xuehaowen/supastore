import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  categories,
  products,
  productVariants,
  storeSettings,
} from "@/infrastructure/db/schema";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";

export async function listAdminProducts(
  staffUserId: string,
  input: {
    q?: string;
    status?: string;
    category?: string;
    sort?: string;
    page?: string;
  },
) {
  const search = input.q?.trim().slice(0, 120) ?? "";
  const status =
    input.status === "published" || input.status === "draft"
      ? input.status
      : "";
  const category = /^[0-9a-f-]{36}$/i.test(input.category ?? "")
    ? input.category!
    : "";
  const sort =
    input.sort === "oldest" || input.sort === "title" ? input.sort : "newest";
  const requestedPage = Number(input.page);
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? Math.min(requestedPage, 100000)
      : 1;
  return db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, staffUserId, "owner");
    const conditions = [];
    if (status)
      conditions.push(eq(products.isPublished, status === "published"));
    if (search) {
      const pattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
      conditions.push(
        or(
          ilike(products.title, pattern),
          ilike(products.handle, pattern),
          sql`exists(select 1 from product_variants v where v.product_id=${products.id} and v.sku ilike ${pattern})`,
        )!,
      );
    }
    if (category)
      conditions.push(
        sql`exists(select 1 from product_categories pc where pc.product_id=${products.id} and pc.category_id=${category}::uuid)`,
      );
    const where = and(...conditions);
    const [count] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(products)
      .where(where);
    const total = count?.total ?? 0;
    const currentPage = Math.min(page, Math.max(1, Math.ceil(total / 25)));
    const rows = await tx
      .select({
        product: products,
        variantCount: sql<number>`count(${productVariants.id})::int`,
        minPrice: sql<number | null>`min(${productVariants.priceCents})`,
        maxPrice: sql<number | null>`max(${productVariants.priceCents})`,
      })
      .from(products)
      .leftJoin(productVariants, eq(productVariants.productId, products.id))
      .where(where)
      .groupBy(products.id)
      .orderBy(
        sort === "title"
          ? asc(products.title)
          : sort === "oldest"
            ? asc(products.createdAt)
            : desc(products.createdAt),
        asc(products.id),
      )
      .limit(25)
      .offset((currentPage - 1) * 25);
    const groups = await tx
      .select()
      .from(categories)
      .orderBy(asc(categories.name));
    const [store] = await tx.select().from(storeSettings).limit(1);
    return {
      rows,
      groups,
      store,
      total,
      page: currentPage,
      search,
      status,
      category,
      sort,
    };
  });
}
