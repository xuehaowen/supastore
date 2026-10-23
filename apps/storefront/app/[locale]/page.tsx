import Catalog from "../catalog";
import { readRequestPage } from "../../lib/page-data";
import {
  publicPageMetadata,
  policyPresentation,
} from "../../lib/page-metadata";
import { textFor } from "@supastore/i18n/messages";
type Query = {
  q?: string;
  category?: string;
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
  return (
    <Catalog
      showHero
      locale={(await params).locale}
      query={await searchParams}
    />
  );
}
