import { storePageKeys, PLATFORM_NAME } from "@supastore/contracts";
import { readRequestPage } from "../../lib/page-data";
import { textFor } from "@supastore/i18n/messages";
import { LanguageLink } from "../language-link";
import { StorefrontNavLink } from "../storefront-nav-link";
import { DocumentLanguage } from "../../../../packages/i18n/src/document-language";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Alert, AlertDescription } from "@supastore/ui/alert";
import { StorefrontMenu, StorefrontHeader } from "../storefront-menu";
import { designCopy } from "../../lib/design-copy";
import { readRequestPage as readCustomerPage } from "../../lib/page-data";
import { Search, ShoppingBag, ArrowLeft } from "lucide-react";
import { AnalyticsPreference } from "../analytics";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const { store } = await readRequestPage("layout", locale);
  return { title: store?.storeName || textFor(locale).shop };
}
export default async function ShopLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!["en", "zh"].includes(locale)) notFound();
  const t = await getTranslations({ locale });
  const { store, session } = await readRequestPage("layout", locale);
  const { cart } = await readCustomerPage("cart", locale);
  const m = designCopy(locale);
  const brand = (
    <Link className="storefront-wordmark" href={`/${locale}`}>
      {store?.storeName ?? PLATFORM_NAME}
    </Link>
  );
  return (
    <div className="storefront-shell" lang={locale}>
      <DocumentLanguage locale={locale} />
      <a
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-background focus:p-4"
        href="#main"
      >
        {textFor(locale).common.skipToContent}
      </a>
      <StorefrontHeader
        checkoutBrand={brand}
        checkoutLink={
          <Link className="checkout-back" href={`/${locale}/cart`}>
            <ArrowLeft size={16} />
            {m.backBag}
          </Link>
        }
      >
        <Link className="storefront-wordmark" href={"/" + locale}>
          {store?.logoKey && (
            <Image
              className="mr-2 inline-block size-10 object-contain align-middle"
              src={"/api/assets?key=" + encodeURIComponent(store.logoKey)}
              alt=""
              width={40}
              height={40}
              unoptimized
            />
          )}
          {store?.storeName ?? PLATFORM_NAME}
          <span className="mt-1 block font-sans text-[9px] tracking-[0.16em]">
            {textFor(locale).common.storeTagline}
          </span>
        </Link>
        <nav
          className="storefront-desktop-nav"
          aria-label={textFor(locale).shop}
        >
          <StorefrontNavLink
            locale={locale}
            shop
            className="transition-colors hover:text-muted-foreground"
            href={"/" + locale}
          >
            {t("shop")}
          </StorefrontNavLink>
          <StorefrontNavLink
            locale={locale}
            className="transition-colors hover:text-muted-foreground"
            href={`/recover?locale=${locale}`}
          >
            {t("recover")}
          </StorefrontNavLink>
          <StorefrontNavLink
            locale={locale}
            className="transition-colors hover:text-muted-foreground"
            href={"/" + locale + "/account"}
          >
            {session ? textFor(locale).ui.account : textFor(locale).auth.signIn}
          </StorefrontNavLink>
          <Link
            className="storefront-search-link"
            href={`/${locale}/search`}
            aria-label={m.search}
          >
            <Search size={18} />
          </Link>
          <StorefrontNavLink
            locale={locale}
            className="rounded-md border px-3 py-1.5 font-medium no-underline transition-colors hover:bg-muted"
            href={"/" + locale + "/cart"}
          >
            <ShoppingBag size={16} aria-hidden="true" /> {t("cart")}{" "}
            <span className="bag-count">{cart?.itemCount ?? 0}</span>
          </StorefrontNavLink>
          <LanguageLink locale={locale} />
        </nav>
        <div className="storefront-mobile-actions">
          <LanguageLink locale={locale} />
          <Link
            href={`/${locale}/cart`}
            aria-label={`${m.bag} (${cart?.itemCount ?? 0})`}
          >
            <ShoppingBag size={19} />
            <span className="bag-count">{cart?.itemCount ?? 0}</span>
          </Link>
          <StorefrontMenu
            locale={locale}
            accountLabel={session ? m.account : textFor(locale).auth.signIn}
            recoverLabel={t("recover")}
          />
        </div>
      </StorefrontHeader>
      {store?.isPaused && (
        <Alert className="mt-6">
          <AlertDescription>{store.pauseMessage}</AlertDescription>
        </Alert>
      )}
      <main id="main" tabIndex={-1} className="flex-1">
        {children}
      </main>
      <footer role="contentinfo" className="storefront-footer">
        <div className="footer-link-groups">
          {[
            ["shipping", "returns", "support"],
            ["about", "privacy", "terms"],
          ].map((keys, index) => (
            <nav key={index} aria-label={index ? m.information : m.help}>
              <h2>{index ? m.information : m.help}</h2>
              {(store ? storePageKeys : [])
                .filter((key) => keys.includes(key))
                .map((key) => (
                  <Link key={key} href={`/${locale}/pages/${key}`}>
                    {
                      textFor(locale).common[
                        (
                          {
                            about: "about",
                            support: "customerSupport",
                            shipping: "shippingPolicy",
                            returns: "returnsPolicy",
                            privacy: "privacyPolicy",
                            terms: "termsOfService",
                          } as const
                        )[key]
                      ]
                    }
                  </Link>
                ))}
              {!index && store?.sms?.enabled && (
                <Link href={`/${locale}/sms`}>{textFor(locale).sms.title}</Link>
              )}
            </nav>
          ))}
        </div>
        <div>
          <p className="font-medium text-foreground">
            {store?.storeName ?? PLATFORM_NAME}
          </p>
          <p className="mt-1">{t("support")}</p>
        </div>
        {store?.supportEmail && (
          <a
            aria-label={textFor(locale).common.customerSupport}
            className="self-start font-medium text-foreground"
            href={"mailto:" + store.supportEmail}
          >
            {store.supportEmail}
          </a>
        )}
      </footer>
      <AnalyticsPreference locale={locale} />
    </div>
  );
}
