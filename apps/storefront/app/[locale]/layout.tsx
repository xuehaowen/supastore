import { PLATFORM_NAME } from "@supastore/contracts";
import { readRequestPage } from "../../lib/page-data";
import { textFor } from "@supastore/i18n/messages";
import { LanguageLink } from "../interactive";
import { StorefrontNavLink } from "../storefront-nav-link";
import { DocumentLanguage } from "../../../../packages/i18n/src/document-language";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Alert, AlertDescription } from "@supastore/ui/alert";
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
  return (
    <div
      className="storefront-shell mx-auto flex min-h-screen max-w-375 flex-col px-[6%]"
      lang={locale}
    >
      <DocumentLanguage locale={locale} />
      <a
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-background focus:p-4"
        href="#main"
      >
        {textFor(locale).common.skipToContent}
      </a>
      <header className="flex items-center justify-between gap-6 border-b py-6 max-sm:items-start">
        <Link
          className="font-serif text-3xl font-semibold no-underline transition-opacity hover:opacity-75"
          href={"/" + locale}
        >
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
          className="flex flex-wrap items-center justify-end gap-x-5 gap-y-3 text-sm max-sm:max-w-52 max-sm:gap-x-3"
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
          <StorefrontNavLink
            locale={locale}
            className="rounded-md border px-3 py-1.5 font-medium no-underline transition-colors hover:bg-muted"
            href={"/" + locale + "/cart"}
          >
            {t("cart")} <span aria-hidden="true">↗</span>
          </StorefrontNavLink>
          <LanguageLink locale={locale} />
        </nav>
      </header>
      {store?.isPaused && (
        <Alert className="mt-6">
          <AlertDescription>{store.pauseMessage}</AlertDescription>
        </Alert>
      )}
      <main id="main" tabIndex={-1} className="flex-1">
        {children}
      </main>
      <footer
        role="contentinfo"
        className="mt-12 flex justify-between gap-6 border-t py-8 text-xs text-muted-foreground max-sm:flex-col"
      >
        <nav
          aria-label={textFor(locale).ui.storeInformation}
          className="flex flex-wrap gap-4"
        >
          {(["about", "shipping", "returns", "privacy", "terms"] as const)
            .filter(
              (key) =>
                store?.publicContent[locale as "en" | "zh"]?.[key] ||
                store?.publicContent[store.defaultLocale as "en" | "zh"]?.[key],
            )
            .map((key) => (
              <Link key={key} href={`/${locale}/pages/${key}`}>
                {
                  textFor(locale).common[
                    (
                      {
                        about: "about",
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
          {store?.sms?.enabled && (
            <Link href={`/${locale}/sms`}>{textFor(locale).sms.title}</Link>
          )}
        </nav>
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
