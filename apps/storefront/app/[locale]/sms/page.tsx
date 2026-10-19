import { readRequestPage } from "../../../lib/page-data";
import { SmsSignupForm } from "../../sms-opt-in";
import { publicPageMetadata } from "../../../lib/page-metadata";
import { textFor } from "@supastore/i18n/messages";
import { notFound } from "next/navigation";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const { store } = await readRequestPage("layout", locale);
  return publicPageMetadata({
    locale,
    path: "/sms",
    title: textFor(locale).sms.title,
    storeName: store?.storeName,
  });
}
export default async function SmsSignup({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const { store } = await readRequestPage("layout", locale);
  if (!store?.sms?.enabled) notFound();
  return (
    <article className="mx-auto max-w-2xl py-14">
      <h1 className="mb-8 font-serif text-4xl">{textFor(locale).sms.title}</h1>
      <SmsSignupForm
        storeName={store.storeName}
        locale={locale}
        available={store.sms.available}
      />
    </article>
  );
}
