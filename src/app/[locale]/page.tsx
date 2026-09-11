import Catalog from "@/app/catalog";
export const revalidate = 3600;
export function generateStaticParams() {
  return [{ locale: "en" }, { locale: "zh" }];
}
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  return <Catalog locale={(await params).locale} />;
}
