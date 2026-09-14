import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import { products, productTranslations } from "@/infrastructure/db/schema";
import { staffIdentity } from "@/infrastructure/web";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { AdminNav } from "@/app/components";

export default async function TranslationsPage() {
  const staff = await staffIdentity().catch(() => redirect("/admin/login"));
  const rows = await db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, staff, "owner");
    return tx
      .select({
        id: products.id,
        title: products.title,
        zhTitle: productTranslations.title,
      })
      .from(products)
      .leftJoin(
        productTranslations,
        and(
          eq(productTranslations.productId, products.id),
          eq(productTranslations.locale, "zh"),
        ),
      )
      .orderBy(asc(products.title));
  });
  return (
    <main className="admin">
      <AdminNav />
      <p className="eyebrow">CATALOG LANGUAGES</p>
      <h1>Translations</h1>
      <p className="admin-description">
        Review Chinese product translations. Products without a translation use
        their default text.
      </p>
      <section className="panel">
        <h2>Product translations</h2>
        {rows.length === 0 ? (
          <p className="admin-empty">
            Add a product to start translating your catalog.
          </p>
        ) : (
          rows.map((row) => (
            <article className="translation-row" key={row.id}>
              <div>
                <h3>{row.title}</h3>
                <p>{row.zhTitle || "Chinese translation missing"}</p>
              </div>
              <Link href={`/admin/products/${row.id}/edit#translations`}>
                Edit translation
              </Link>
            </article>
          ))
        )}
      </section>
    </main>
  );
}
