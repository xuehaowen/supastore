import Catalog from "../catalog";
import { readRequestPage } from "../../lib/page-data";
import {
  publicPageMetadata,
  policyPresentation,
} from "../../lib/page-metadata";
import { textFor } from "@supastore/i18n/messages";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const { store } = await readRequestPage("layout", locale);
  const name = store?.storeName || textFor(locale).shop;
  return publicPageMetadata({
    locale,
    path: "",
    title: name,
    storeName: name,
    description: policyPresentation(store, locale, "about")?.content,
  });
}
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  return <Catalog showHero locale={(await params).locale} />;
}
