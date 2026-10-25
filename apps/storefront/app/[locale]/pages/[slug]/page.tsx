import Link from "next/link";
import { textFor } from "@supastore/i18n/messages";
import { readRequestPage } from "../../../../lib/page-data";
import {
  policyPresentation,
  publicPageMetadata,
} from "../../../../lib/page-metadata";
import { notFound } from "next/navigation";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const { store } = await readRequestPage("layout", locale);
  const policy = policyPresentation(store, locale, slug);
  if (!policy) notFound();
  return publicPageMetadata({
    locale,
    path: "/pages/" + slug,
    title: policy.title,
    storeName: store?.storeName,
    description: policy.content,
    locales: policy.locales,
  });
}
export default async function StorePage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const { store } = await readRequestPage("layout", locale);
  const policy = policyPresentation(store, locale, slug);
  if (!policy) notFound();
  return (
    <article className="mx-auto max-w-3xl py-14">
      <h1 className="mb-8 font-serif text-4xl">{policy.title}</h1>
      <p className="whitespace-pre-line leading-8">{policy.content}</p>
      {store?.supportEmail && (
        <p className="mt-8">
          <a href={`mailto:${store.supportEmail}`}>{store.supportEmail}</a>
        </p>
      )}
      {slug === "support" && (
        <nav className="mt-8 flex gap-6" aria-label={policy.title}>
          <Link href={`/${locale}/account`}>{textFor(locale).ui.account}</Link>
          <Link href={`/recover?locale=${locale}`}>
            {textFor(locale).recover}
          </Link>
        </nav>
      )}
    </article>
  );
}
