import { ResetPasswordClient } from "../../../account-client";
import { getStorefrontMessages } from "../../../../lib/i18n";
export const metadata = { robots: { index: false, follow: false } };
export default async function Reset({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  const m = getStorefrontMessages(locale);
  return (
    <>
      <h1>{m.auth.resetPassword}</h1>
      <ResetPasswordClient locale={locale} messages={{ auth: m.auth }} {...query} />
    </>
  );
}