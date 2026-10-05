import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import { categories } from "@/infrastructure/db/schema";
import Catalog from "@/app/catalog";
export default async function Category({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{
    q?: string;
    page?: string;
    sort?: string;
    options?: string | string[];
  }>;
}) {
  const { locale, slug } = await params;
  const [category] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.slug, slug))
    .limit(1);
  if (!category) notFound();
  return (
    <Catalog
      locale={locale}
      query={{ ...(await searchParams), category: slug }}
    />
  );
}
