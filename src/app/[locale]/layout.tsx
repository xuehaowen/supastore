import { LanguageLink } from "@/app/interactive";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/infrastructure/db";
import { storeSettings } from "@/infrastructure/db/schema";
import { getTranslations } from "next-intl/server";
export default async function ShopLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!["en", "zh"].includes(locale)) notFound();
  const t = await getTranslations({locale});
  const [store] = await db.select().from(storeSettings).limit(1);
  return (
    <div className="shop" lang={locale}>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="masthead">
        <Link className="brand" href={"/" + locale}>
          {store?.logoKey && (
            <img
              className="logo"
              src={"/api/assets?key=" + encodeURIComponent(store.logoKey)}
              alt=""
              width="40"
              height="40"
            />
          )}
          {store?.storeName ?? "SupaStore"}
          <span>EVERYDAY / WELL CHOSEN</span>
        </Link>
        <nav aria-label="Shop">
          <Link href={"/" + locale}>{t("shop")}</Link>
          <Link href="/recover">{t("recover")}</Link>
          <Link href={"/" + locale + "/cart"}>{t("cart")} ↗</Link>
          <LanguageLink locale={locale} />
        </nav>
      </header>
      {store?.isPaused && <p className="notice">{store.pauseMessage}</p>}
      <main id="main">{children}</main>
      <footer>
        <span>
          {store?.storeName ?? "SupaStore"} · {t("support")}
        </span>
        {store?.supportEmail && (
          <a href={"mailto:" + store.supportEmail}>{store.supportEmail}</a>
        )}
      </footer>
    </div>
  );
}
