import { LanguageLink } from "@/app/interactive";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/infrastructure/db";
import { storeSettings } from "@/infrastructure/db/schema";
import { getTranslations } from "next-intl/server";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
    <div className="mx-auto min-h-screen max-w-[1500px] px-[6%]" lang={locale}>
      <a className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-background focus:p-4" href="#main">
        Skip to content
      </a>
      <header className="flex items-center justify-between gap-6 border-b py-7 max-sm:items-start">
        <Link className="font-serif text-3xl font-semibold no-underline" href={"/" + locale}>
          {store?.logoKey && (
            <img
              className="mr-2 inline-block size-10 object-contain align-middle"
              src={"/api/assets?key=" + encodeURIComponent(store.logoKey)}
              alt=""
              width="40"
              height="40"
            />
          )}
          {store?.storeName ?? "SupaStore"}
          <span className="mt-1 block font-sans text-[9px] tracking-[0.16em]">EVERYDAY / WELL CHOSEN</span>
        </Link>
        <nav className="flex flex-wrap justify-end gap-5 text-sm max-sm:max-w-48 max-sm:gap-3" aria-label="Shop">
          <Link href={"/" + locale}>{t("shop")}</Link>
          <Link href="/recover">{t("recover")}</Link>
          <Link href={"/" + locale + "/cart"}>{t("cart")} ↗</Link>
          <LanguageLink locale={locale} />
        </nav>
      </header>
      {store?.isPaused && <Alert className="mt-6"><AlertDescription>{store.pauseMessage}</AlertDescription></Alert>}
      <main id="main">{children}</main>
      <footer className="mt-12 flex justify-between gap-6 border-t py-8 text-xs text-muted-foreground max-sm:flex-col">
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
