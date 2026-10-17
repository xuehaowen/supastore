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
    </article>
  );
}
