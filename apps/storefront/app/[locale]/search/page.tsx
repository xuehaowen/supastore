import Catalog from "../../catalog";
import { textFor } from "@supastore/i18n/messages";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  return {
    title: textFor((await params).locale).search,
    robots: { index: false, follow: true },
  };
}
export default async function Search({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    q?: string;
    category?: string;
    page?: string;
    sort?: string;
    options?: string | string[];
  }>;
}) {
  return <Catalog locale={(await params).locale} query={await searchParams} />;
}
