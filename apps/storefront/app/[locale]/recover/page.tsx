import { RecoveryClient } from "../../account-client";
import { getStorefrontMessages } from "../../../lib/i18n";
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
  const m = getStorefrontMessages(locale);
  return (
    <>
      <h1>{m.recovery.title}</h1>
      <RecoveryClient locale={locale} messages={m.recovery} {...query} />
    </>
  );
}