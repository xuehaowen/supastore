import Link from "next/link";
import { notFound } from "next/navigation";
import { readApi, type Store } from "../../lib/api";
import { AnalyticsPreference } from "../analytics";
import { getStorefrontMessages } from "../../lib/i18n";
import { LanguageLink } from "../language-link";
import { DocumentLanguage } from "../../../../packages/i18n/src/document-language";
export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!["en", "zh"].includes(locale)) notFound();
  const store = await readApi<Store | null>("store");
  const m = getStorefrontMessages(locale);
  return (
    <div lang={locale}>
      <DocumentLanguage locale={locale} />
      <header>
        <Link href={`/${locale}`}>
          {store?.storeName || m.common.storeTitle}
        </Link>
        <nav>
          <Link href={`/${locale}/cart`}>{m.nav.cart}</Link>
          <Link href={`/${locale}/account`}>{m.nav.account}</Link>
          <Link href={`/${locale}/recover`}>{m.nav.findOrder}</Link>
          <LanguageLink locale={locale} />
        </nav>
      </header>
      <main>
        {store?.isPaused && (
          <p className="notice">{store.pauseMessage || m.nav.pauseDefault}</p>
        )}
        {children}
      </main>
      <footer>
        <AnalyticsPreference locale={locale} messages={m.analytics} />
        {store?.supportEmail && (
          <a href={`mailto:${store.supportEmail}`}>{m.nav.contactStore}</a>
        )}
      </footer>
    </div>
  );
}
