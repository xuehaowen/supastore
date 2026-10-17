import { readRequestPage } from "../../../../lib/page-data";
import { publicPageMetadata } from "../../../../lib/page-metadata";
export async function generateMetadata({
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
  const query = await searchParams;
  const data = await readRequestPage("catalog", locale, {
    ...query,
    category: slug,
  });
  const category = data.groups.find((group) => group.slug === slug);
  if (!category) notFound();
  return {
    ...publicPageMetadata({
      locale,
      path: "/categories/" + encodeURIComponent(slug),
      title: category.name,
      storeName: data.store?.storeName,
      page: data.result.page,
    }),
    ...(query.q || query.options || (query.sort && query.sort !== "newest")
      ? { robots: { index: false, follow: true } }
      : {}),
  };
}
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
  const query = await searchParams;
  const { groups } = await readRequestPage("catalog", locale, {
    ...query,
    category: slug,
  });
  if (!groups.some((category) => category.slug === slug)) notFound();
  return <Catalog locale={locale} query={{ ...query, category: slug }} />;
}
