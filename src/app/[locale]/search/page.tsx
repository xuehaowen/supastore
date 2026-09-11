import Catalog from "@/app/catalog";
export default async function Search({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; category?: string; page?: string }>;
}) {
  return <Catalog locale={(await params).locale} query={await searchParams} />;
}
