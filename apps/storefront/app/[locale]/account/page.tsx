import { AccountClient } from "../../account-client";
import { getStorefrontMessages } from "../../../lib/i18n";
export const metadata = { robots: { index: false, follow: false } };
export default async function Account({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const m = getStorefrontMessages(locale);
  return (
    <>
      <h1>{m.account.title}</h1>
      <AccountClient
        locale={locale}
        messages={{ account: m.account, auth: m.auth, address: m.address }}
      />
    </>
  );
}
