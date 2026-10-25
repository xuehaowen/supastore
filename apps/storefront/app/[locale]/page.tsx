import Catalog from "../catalog";
import { readRequestPage } from "../../lib/page-data";
import {
  publicPageMetadata,
  policyPresentation,
} from "../../lib/page-metadata";
import { textFor } from "@supastore/i18n/messages";
import { redirect } from "next/navigation";
type Query = {
  q?: string;
  category?: string;
  collection?: string;
  page?: string;
  sort?: string;
  options?: string | string[];
};
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Query>;
}) {
  const { locale } = await params;
  const { store } = await readRequestPage("layout", locale);
  const name = store?.storeName || textFor(locale).shop;
  const query = await searchParams;
  const { result } = await readRequestPage("catalog", locale, {
    ...query,
    home: "1",
  });
  return {
    ...publicPageMetadata({
      locale,
      path: "",
      title: name,
      storeName: name,
      description: policyPresentation(store, locale, "about")?.content,
      page: result.page,
    }),
    ...(query.q ||
    query.category ||
    query.options ||
    (query.sort && query.sort !== "newest")
      ? { robots: { index: false, follow: true } }
      : {}),
  };
}
export const dynamic = "force-dynamic";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Query>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  const search = new URLSearchParams();
  for (const key of [
    "q",
    "category",
    "collection",
    "page",
    "sort",
    "options",
  ] as const) {
    const value = query[key];
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item) search.append(key, item);
    }
  }
  if (search.size) redirect(`/${locale}/search?${search}`);
  return <Catalog showHero locale={locale} />;
}
