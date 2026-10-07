import { redirect } from "next/navigation";
export const metadata = { robots: { index: false, follow: false } };
export default async function Exchange({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  redirect(`/en/recover${token ? `?token=${encodeURIComponent(token)}` : ""}`);
}
