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
  storeSettings,
} from "@/infrastructure/db/schema";
import { staffIdentity } from "@/infrastructure/web";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { Field, Hidden, Notice } from "@/app/components";
import { AdminNav } from "@/app/admin/admin-nav";
import { AdminDialog } from "@/app/admin/admin-dialog";
import { saveCatalogTranslation } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { translationLocales } from "@/domain/catalog-locales";

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
  searchParams: Promise<{ error?: string; locale?: string }>;
}) {
  const staff = await staffIdentity().catch(() => redirect("/admin/login"));
  const q = await searchParams;
  const data = await db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, staff, "owner");
    const [settings] = await tx.select().from(storeSettings).limit(1);
    const defaultLocale = settings?.defaultLocale === "zh" ? "zh" : "en";
    const availableLocales = translationLocales(defaultLocale);
    const targetLocale =
      availableLocales.find((locale) => locale === q.locale) ??
      availableLocales[0]!;
    return {
      defaultLocale,
      targetLocale,
      availableLocales,
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
            eq(productTranslations.locale, targetLocale),
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
            eq(categoryTranslations.locale, targetLocale),
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
            eq(variantTranslations.locale, targetLocale),
          ),
        )
        .orderBy(asc(productVariants.sku)),
    };
  });
  const languageName = (locale: string) =>
    locale === "zh" ? "Chinese" : locale === "en" ? "English" : locale;
  const editor = (
    entityType: "product" | "category" | "variant",
    item: TranslationItem,
  ) => (
    <div className="translation-row" key={item.id}>
      <span>
        <strong>{item.name}</strong>
        <small>
          {item.sku ?? (item.translated ? "Translated" : "Translation missing")}
        </small>
      </span>
      <AdminDialog
        trigger={item.translated ? "Edit translation" : "Add translation"}
        title={`${languageName(data.targetLocale)} translation · ${item.name}`}
        description={`The source text remains in ${languageName(data.defaultLocale)}.`}
      >
        <form action={saveCatalogTranslation} className="grid gap-4">
          <Hidden name="entityType" value={entityType} />
          <Hidden name="entityId" value={item.id} />
          <Hidden name="translationLocale" value={data.targetLocale} />
          <Field
            name="title"
            label={`${languageName(data.targetLocale)} text`}
            value={item.translated ?? ""}
          />
          {entityType === "product" && (
            <label>
              {languageName(data.targetLocale)} description
              <Textarea
                name="description"
                defaultValue={item.description ?? ""}
              />
            </label>
          )}
          <Button type="submit">Save translation</Button>
        </form>
      </AdminDialog>
    </div>
  );
  return (
    <main className="admin">
      <AdminNav />
      <p className="eyebrow">CATALOG LANGUAGES</p>
      <h1>Translations</h1>
      <p className="admin-description">
        Base catalog content is {languageName(data.defaultLocale)}. Add and
        maintain translations for each other storefront locale.
      </p>
      <Notice error={q.error} />
      <form method="get" className="admin-filter-bar">
        <label>
          Translation locale
          <NativeSelect name="locale" defaultValue={data.targetLocale}>
            {data.availableLocales.map((locale) => (
              <option value={locale} key={locale}>
                {languageName(locale)} ({locale})
              </option>
            ))}
          </NativeSelect>
        </label>
        <Button type="submit">Open locale</Button>
      </form>
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
