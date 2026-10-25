import { redirect } from "next/navigation";
export const metadata = { robots: { index: false, follow: false } };
export default async function Recover({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  const search = new URLSearchParams({ locale });
  if (query.token) search.set("token", query.token);
  redirect((query.token ? "/recover/exchange" : "/recover") + "?" + search);
}
