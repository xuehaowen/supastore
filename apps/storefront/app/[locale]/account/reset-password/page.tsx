import { textFor } from "@supastore/i18n/messages";
import { CustomerAuthTools } from "../../../customer-auth";
import Link from "next/link";
export const metadata = { robots: { index: false, follow: false } };
export default async function ResetPassword({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  return (
    <section className="storefront-state">
      <Link href={`/${locale}/account`}>← {textFor(locale).ui.account}</Link>
      <h1>{textFor(locale).auth.resetPassword}</h1>
      <CustomerAuthTools
        locale={locale}
        reset
        {...(query.token ? { token: query.token } : {})}
        invalidToken={Boolean(query.error)}
      />
    </section>
  );
}
