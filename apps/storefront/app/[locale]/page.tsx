import Catalog from "../catalog";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  return <Catalog showHero locale={(await params).locale} />;
}
