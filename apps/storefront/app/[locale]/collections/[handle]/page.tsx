import { readRequestPage } from "../../../../lib/page-data";
import { publicPageMetadata } from "../../../../lib/page-metadata";
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; handle: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { locale, handle } = await params;
  const { collection, translated, result, store } = await readRequestPage(
    "collection",
    locale,
    { ...(await searchParams), handle },
  );
  return publicPageMetadata({
    locale,
    path: "/collections/" + encodeURIComponent(handle),
    title: translated?.title ?? collection.title,
    storeName: store?.storeName,
    description: translated?.description ?? collection.description,
    page: result.page,
  });
}
import Catalog from "../../../catalog";
export default async function Collection({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; handle: string }>;
  searchParams: Promise<{
    q?: string;
    category?: string;
    page?: string;
    sort?: string;
    options?: string | string[];
  }>;
}) {
  const { locale, handle } = await params;
  return (
    <Catalog
      locale={locale}
      collectionPage
      query={{ ...(await searchParams), collection: handle }}
    />
  );
}
