import { and, asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/infrastructure/db";
import {
  categories,
  categoryTranslations,
  products,
  productTranslations,
  productVariants,
  variantTranslations,
} from "@/infrastructure/db/schema";
import { staffIdentity } from "@/infrastructure/web";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { AdminNav, Field, Hidden, Notice } from "@/app/components";
import { saveCatalogTranslation } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type TranslationItem = {
  id: string;
  name: string;
  translated: string | null;
  description?: string | null;
  sku?: string;
};

export default async function TranslationsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const staff = await staffIdentity().catch(() => redirect("/admin/login"));
  const data = await db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, staff, "owner");
    return {
      products: await tx
        .select({
          id: products.id,
          name: products.title,
          translated: productTranslations.title,
          description: productTranslations.description,
        })
        .from(products)
        .leftJoin(
          productTranslations,
          and(
            eq(productTranslations.productId, products.id),
            eq(productTranslations.locale, "zh"),
          ),
        )
        .orderBy(asc(products.title)),
      categories: await tx
        .select({
          id: categories.id,
          name: categories.name,
          translated: categoryTranslations.name,
        })
        .from(categories)
        .leftJoin(
          categoryTranslations,
          and(
            eq(categoryTranslations.categoryId, categories.id),
            eq(categoryTranslations.locale, "zh"),
          ),
        )
        .orderBy(asc(categories.name)),
      variants: await tx
        .select({
          id: productVariants.id,
          name: productVariants.title,
          sku: productVariants.sku,
          translated: variantTranslations.title,
        })
        .from(productVariants)
        .leftJoin(
          variantTranslations,
          and(
            eq(variantTranslations.variantId, productVariants.id),
            eq(variantTranslations.locale, "zh"),
          ),
        )
        .orderBy(asc(productVariants.sku)),
    };
  });
  const q = await searchParams;
  const editor = (
    entityType: "product" | "category" | "variant",
    item: TranslationItem,
  ) => (
    <form
      action={saveCatalogTranslation}
      className="translation-editor"
      key={item.id}
    >
      <Hidden name="entityType" value={entityType} />
      <Hidden name="entityId" value={item.id} />
      <Hidden name="translationLocale" value="zh" />
      <span>
        <strong>{item.name}</strong>
        <small>
          {item.sku ?? (item.translated ? "Translated" : "Translation missing")}
        </small>
      </span>
      <Field name="title" label="Chinese text" value={item.translated ?? ""} />
      {entityType === "product" ? (
        <label>
          Chinese description
          <Textarea name="description" defaultValue={item.description ?? ""} />
        </label>
      ) : (
        <span />
      )}
      <Button type="submit" variant="outline">
        Save translation
      </Button>
    </form>
  );
  return (
    <main className="admin">
      <AdminNav />
      <p className="eyebrow">CATALOG LANGUAGES</p>
      <h1>Translations</h1>
      <p className="admin-description">
        Manage Chinese storefront text for products, categories, and variants.
      </p>
      <Notice error={q.error} />
      <section className="panel">
        <h2>Products</h2>
        {data.products.map((item) => editor("product", item))}
      </section>
      <section className="panel">
        <h2>Categories</h2>
        {data.categories.map((item) => editor("category", item))}
      </section>
      <section className="panel">
        <h2>Variants</h2>
        {data.variants.map((item) => editor("variant", item))}
      </section>
    </main>
  );
}
