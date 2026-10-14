import { asc, ilike, or } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import { categories } from "@/infrastructure/db/schema";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
export async function searchCategoryOptions(
  staffUserId: string,
  search: string,
) {
  const pattern = `%${search
    .trim()
    .slice(0, 120)
    .replace(/[\\%_]/g, "\\$&")}%`;
  return db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, staffUserId, "owner");
    const rows = await tx
      .select({ id: categories.id, label: categories.name })
      .from(categories)
      .where(
        or(ilike(categories.name, pattern), ilike(categories.slug, pattern)),
      )
      .orderBy(asc(categories.name), asc(categories.id))
      .limit(51);
    return { options: rows.slice(0, 50), hasNext: rows.length > 50 };
  });
}
