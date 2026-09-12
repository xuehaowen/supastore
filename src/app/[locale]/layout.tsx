import { LanguageLink } from "@/app/interactive";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/infrastructure/db";
import { storeSettings } from "@/infrastructure/db/schema";
import { auth } from "@/infrastructure/auth";
import { headers } from "next/headers";
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
  const rawSession = await auth.api.getSession({ headers: await headers() });
  const session = rawSession?.user.emailVerified ? rawSession : null;
  return (
    <div className="mx-auto flex min-h-screen max-w-375 flex-col px-[6%]" lang={locale}>
      <a className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-background focus:p-4" href="#main">
        Skip to content
      </a>
      <header className="flex items-center justify-between gap-6 border-b py-6 max-sm:items-start">
        <Link className="font-serif text-3xl font-semibold no-underline transition-opacity hover:opacity-75" href={"/" + locale}>
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
        <nav className="flex flex-wrap items-center justify-end gap-x-5 gap-y-3 text-sm max-sm:max-w-52 max-sm:gap-x-3" aria-label="Shop">
          <Link className="transition-colors hover:text-muted-foreground" href={"/" + locale}>{t("shop")}</Link>
          <Link className="transition-colors hover:text-muted-foreground" href="/recover">{t("recover")}</Link>
          <Link className="transition-colors hover:text-muted-foreground" href={"/" + locale + "/account"}>
            {session ? "Account" : "Sign in"}
          </Link>
          <Link className="rounded-md border px-3 py-1.5 font-medium no-underline transition-colors hover:bg-muted" href={"/" + locale + "/cart"}>{t("cart")} <span aria-hidden="true">↗</span></Link>
          <LanguageLink locale={locale} />
        </nav>
      </header>
      {store?.isPaused && <Alert className="mt-6"><AlertDescription>{store.pauseMessage}</AlertDescription></Alert>}
      <main id="main" className="flex-1">{children}</main>
      <footer role="contentinfo" className="mt-12 flex justify-between gap-6 border-t py-8 text-xs text-muted-foreground max-sm:flex-col">
        <div>
          <p className="font-medium text-foreground">{store?.storeName ?? "SupaStore"}</p>
          <p className="mt-1">{t("support")}</p>
        </div>
        {store?.supportEmail && (
          <a aria-label="Customer support" className="self-start font-medium text-foreground" href={"mailto:" + store.supportEmail}>{store.supportEmail}</a>
        )}
      </footer>
    </div>
  );
}
