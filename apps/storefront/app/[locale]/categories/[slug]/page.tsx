import { readPage } from "../../../../lib/page-data";
import { notFound } from "next/navigation";
import Catalog from "../../../catalog";
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
  const { groups } = await readPage("catalog", locale, { category: slug });
  if (!groups.some((category) => category.slug === slug)) notFound();
  return (
    <Catalog
      locale={locale}
      query={{ ...(await searchParams), category: slug }}
    />
  );
}
