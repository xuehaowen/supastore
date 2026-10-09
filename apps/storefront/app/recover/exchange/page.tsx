import { redirect } from "next/navigation";
export const metadata = { robots: { index: false, follow: false } };
export default async function Exchange({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; locale?: string }>;
}) {
  const { token, locale } = await searchParams;
  redirect(
    `/${locale === "zh" ? "zh" : "en"}/recover${token ? `?token=${encodeURIComponent(token)}` : ""}`,
  );
}
